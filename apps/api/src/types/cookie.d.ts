declare module "cookie" {
  export function parseCookie(str: string): Record<string, string>;
}
