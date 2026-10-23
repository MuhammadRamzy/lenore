# Lenore media sync, 2026-10-23. Phases (each resumable, all logged):
#   decide  - compare current remote bytes with today's deterministic encoding
#   upload  - new immutable keys for added/replaced slots (old objects kept = backup)
#   link    - write SQL that repoints only those media columns, guarded on the old key
# Usage: python3 -I sync.py decide|upload|link
import json, os, subprocess, sys, uuid, hashlib, shutil
S = os.path.dirname(os.path.abspath(__file__)) + "/"
PROJ = "/home/mhdramzy/Projects/lenore"
sha = lambda b: hashlib.sha256(b).hexdigest()
plan = json.load(open(S + "plan.json"))
LOG = S + "upload-log.jsonl"

def log(entry):
    with open(LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")

def logged():
    out = {}
    if os.path.exists(LOG):
        for line in open(LOG):
            e = json.loads(line)
            out.setdefault(e["tag"], {}).update(e)
    return out

def remote(key):
    p = S + "remote/" + key
    return open(p, "rb").read() if key and os.path.exists(p) and os.path.getsize(p) else None

def decide():
    done = logged()
    counts = {}
    for r in plan:
        if "action" in done.get(r["tag"], {}):
            a = done[r["tag"]]["action"]
        elif r.get("proven_by_previous_sync"):
            a = "already-current"
            log({"tag": r["tag"], "code": r["code"], "slot": r["slot"], "product_id": r["product_id"],
                 "source_sha256": r["source_sha256"], "encoded_sha256": r["encoded_sha256"],
                 "thumb_sha256": r["thumb_sha256"], "old_key": r["old_key"], "action": a,
                 "evidence": "same immutable key as verified sync 2026-10-23 and identical encoding"})
        elif not r["old_key"]:
            a = "add"
            m = t = None
            log({"tag": r["tag"], "code": r["code"], "slot": r["slot"], "product_id": r["product_id"],
                 "source_sha256": r["source_sha256"], "encoded_sha256": r["encoded_sha256"],
                 "thumb_sha256": r["thumb_sha256"], "old_key": None, "action": a})
        else:
            m, t = remote(r["old_key"]), remote(r["old_key"] + ".600")
            same = m is not None and t is not None and sha(m) == r["encoded_sha256"] and sha(t) == r["thumb_sha256"]
            a = "already-current" if same else "replace"
            if a == "replace":
                # Back up what the slot currently points to before it is repointed.
                os.makedirs(S + "backup", exist_ok=True)
                for k in (r["old_key"], r["old_key"] + ".600"):
                    if remote(k):
                        shutil.copy(S + "remote/" + k, S + "backup/" + k)
            log({"tag": r["tag"], "code": r["code"], "slot": r["slot"], "product_id": r["product_id"],
                 "source_sha256": r["source_sha256"], "encoded_sha256": r["encoded_sha256"],
                 "thumb_sha256": r["thumb_sha256"], "old_key": r["old_key"],
                 "old_main_sha256": sha(m) if r["old_key"] and m else None,
                 "old_thumb_sha256": sha(t) if r["old_key"] and t else None, "action": a})
        counts[a] = counts.get(a, 0) + 1
    print(counts)

def put(key, path):
    for _ in range(3):
        p = subprocess.run(["npx", "wrangler", "r2", "object", "put", f"lenore-production-media/{key}",
                            "--file", path, "--content-type", "image/webp", "--remote"],
                           cwd=PROJ, capture_output=True, text=True)
        if p.returncode == 0:
            return True
    return False

def upload():
    from concurrent.futures import ThreadPoolExecutor
    done = logged()
    todo = [r for r in plan if done[r["tag"]]["action"] in ("add", "replace") and not done[r["tag"]].get("uploaded")]
    def one(r):
        key = done[r["tag"]].get("new_key") or str(uuid.uuid4())
        ok = put(key, S + f"enc/{r['tag']}.webp") and put(key + ".600", S + f"enc/{r['tag']}.600.webp")
        return r, key, ok
    with ThreadPoolExecutor(8) as ex:
        for r, key, ok in ex.map(one, todo):
            log({"tag": r["tag"], "new_key": key, "uploaded": ok})
            print(("ok  " if ok else "FAIL"), r["code"], r["slot"], key)

def link():
    done = logged()
    q = lambda v: "NULL" if v is None else "'" + v.replace("'", "''") + "'"
    lines = []
    for r in plan:
        e = done[r["tag"]]
        if e["action"] not in ("add", "replace"):
            continue
        assert e.get("uploaded"), r["tag"]
        col = "image_key" if r["slot"] == "photo" else "poster_key"
        guard = f"{col} IS NULL" if r["old_key"] is None else f"{col}={q(r['old_key'])}"
        lines.append(f"UPDATE products SET {col}={q(e['new_key'])},revision=revision+1,last_actor='image sync 2026-10-23b',"
                     f"updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id={q(r['product_id'])} AND {guard};")
    open(S + "link.sql", "w").write("\n".join(lines) + "\n")
    print(len(lines), "link statements")

{"decide": decide, "upload": upload, "link": link}[sys.argv[1]]()
