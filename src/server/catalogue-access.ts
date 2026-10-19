import {Hono} from "hono";
import {setCookie,deleteCookie} from "hono/cookie";
import {z} from "zod";
import {authenticated,type Bindings} from "./index";
import {hashPassword,verifyPassword,sha256,consumeLimit} from "./auth";
type RequestContext={req:{raw:Request};env:Bindings};
type AccessRow={enabled:number;password_hash:string|null;generation:number;revision:number};
const readAccess=(db:D1Database)=>db.prepare("SELECT * FROM catalogue_access WHERE id=1").first<AccessRow>();
const state=(r:AccessRow)=>({protected:!!r.enabled,hasPassword:!!r.password_hash,revision:r.revision});
export async function catalogueAuthorized(c:RequestContext){
  if(await authenticated(c))return true;
  const access=await readAccess(c.env.DB);
  if(!access) return false;
  if(!access.enabled)return true;
  const token=/(?:^|;\s*)lenore_catalogue=([^;]+)/.exec(c.req.raw.headers.get("cookie")??"")?.[1];
  if(!token)return false;
  return !!await c.env.DB.prepare("SELECT 1 FROM catalogue_sessions s JOIN catalogue_access a ON a.id=1 AND s.generation=a.generation WHERE token_hash=? AND expires_at>?").bind(await sha256(token),Date.now()).first();
}
const routes=new Hono<{Bindings:Bindings}>();
routes.get("/catalogue-access",async c=>{const a=await readAccess(c.env.DB);return c.json({protected:!!a?.enabled,authorized:await catalogueAuthorized(c)});});
routes.post("/catalogue-access",async c=>{
  const {password}=z.object({password:z.string().min(1).max(128)}).strict().parse(await c.req.json());
  const ip=c.req.header("CF-Connecting-IP")??"local";
  if(!await consumeLimit(c.env.DB,"catalogue-login",ip,10))return c.json({error:"Too many attempts. Try again in 10 minutes."},429);
  const a=await readAccess(c.env.DB);
  if(!a)return c.json({error:"Catalogue access is unavailable."},503);
  if(!a.enabled)return c.json({authorized:true});
  if(!await verifyPassword(password,a.password_hash??undefined))return c.json({error:"Catalogue password not recognised."},401);
  const token=crypto.randomUUID()+crypto.randomUUID();
  const row=await c.env.DB.prepare("INSERT INTO catalogue_sessions(token_hash,generation,expires_at) SELECT ?,generation,? FROM catalogue_access WHERE id=1 AND enabled=1 AND generation=? AND password_hash=? RETURNING token_hash").bind(await sha256(token),Date.now()+8*3600000,a.generation,a.password_hash).first();
  if(!row)return c.json({error:"Catalogue access changed. Try the current password."},409);
  await c.env.DB.batch([c.env.DB.prepare("DELETE FROM catalogue_sessions WHERE expires_at<=?").bind(Date.now()),c.env.DB.prepare("DELETE FROM rate_limits WHERE key=?").bind(`catalogue-login:${await sha256(ip)}`)]);
  setCookie(c,"lenore_catalogue",token,{httpOnly:true,secure:new URL(c.req.url).protocol==="https:",sameSite:"Strict",path:"/",maxAge:8*3600});return c.json({authorized:true});
});
routes.delete("/catalogue-access",async c=>{
  const token=/(?:^|;\s*)lenore_catalogue=([^;]+)/.exec(c.req.header("Cookie")??"")?.[1];
  if(token)await c.env.DB.prepare("DELETE FROM catalogue_sessions WHERE token_hash=?").bind(await sha256(token)).run();
  deleteCookie(c,"lenore_catalogue",{path:"/"});return c.json({authorized:false});
});
routes.get("/admin/catalogue-access",async c=>{const a=await readAccess(c.env.DB);return a?c.json(state(a)):c.json({error:"Catalogue settings unavailable."},503);});
routes.put("/admin/catalogue-access",async c=>{
  const d=z.object({protected:z.boolean(),password:z.string().max(128).optional(),revision:z.number().int().positive()}).strict().parse(await c.req.json());
  const old=await readAccess(c.env.DB);if(!old)return c.json({error:"Catalogue settings unavailable."},503);
  const hash=d.password?await hashPassword(d.password):old.password_hash;
  if(d.protected&&!hash)return c.json({error:"Set a catalogue password before enabling protection."},400);
  const row=await c.env.DB.prepare("UPDATE catalogue_access SET enabled=?,password_hash=?,generation=generation+1,revision=revision+1 WHERE id=1 AND revision=? RETURNING *").bind(+d.protected,hash,d.revision).first<AccessRow>();
  if(!row)return c.json({error:"Catalogue settings changed. Refresh and try again."},409);
  await c.env.DB.prepare("DELETE FROM catalogue_sessions WHERE generation<>?").bind(row.generation).run();
  return c.json(state(row));
});
routes.post("/admin/catalogue-access/revoke",async c=>{
  const {revision}=z.object({revision:z.number().int().positive()}).strict().parse(await c.req.json());
  const row=await c.env.DB.prepare("UPDATE catalogue_access SET generation=generation+1,revision=revision+1 WHERE id=1 AND revision=? RETURNING *").bind(revision).first<AccessRow>();
  if(!row)return c.json({error:"Catalogue settings changed. Refresh and try again."},409);
  await c.env.DB.prepare("DELETE FROM catalogue_sessions WHERE generation<>?").bind(row.generation).run();return c.json(state(row));
});
export default routes;
