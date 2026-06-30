export function magicLinkSessionHours() {
  return Number(process.env.MAGIC_LINK_SESSION_HOURS) || 12;
}

export function magicLinkSessionSeconds() {
  return magicLinkSessionHours() * 3600;
}
