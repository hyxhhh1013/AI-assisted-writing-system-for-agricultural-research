import { readFileSync } from "fs";
import { SignJWT } from "jose";

function readEnv(key) {
  const lines = readFileSync(".env", "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(new RegExp("^" + key + "=(.*)$"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const secret = readEnv("JWT_SECRET");
if (!secret) {
  console.error("JWT_SECRET 未找到");
  process.exit(1);
}
const token = await new SignJWT({ sub: process.argv[2] })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(secret));
process.stdout.write(token);
