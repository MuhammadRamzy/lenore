export type SiteConfig = {
  demo: boolean;
  whatsapp: string;
  integration: string;
};
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={`brand ${compact ? "compact" : ""}`}
      href="/"
      aria-label="Lenore home"
    >
      <img src="/images/lenore-mark.png" alt="" />
      <span>
        LENORE<small>BATH FITTINGS & SANITARY WARE</small>
      </span>
    </a>
  );
}
