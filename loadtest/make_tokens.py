#!/usr/bin/env python3
"""Signs one login token (JWT) per test user, so the load test doesn't have to log 1,000 people in
(Supabase rate-limits logins per IP, which would test its protection rather than the app).

Usage:
  psql "$DB_URL" -Atc "select id from auth.users where email like 'loadtest+%' order by email" \
    | python3 loadtest/make_tokens.py --secret "$JWT_SECRET" > loadtest/tokens.json

JWT_SECRET: the local test secret, or for a Supabase TEST project its JWT secret
(Project Settings -> API -> JWT secret / legacy JWT secret). Never commit tokens.json.
"""
import argparse, base64, hashlib, hmac, json, sys, time


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def sign(sub: str, secret: str, hours: int) -> str:
    now = int(time.time())
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64(json.dumps({"sub": sub, "role": "authenticated", "aud": "authenticated",
                              "iat": now, "exp": now + hours * 3600}, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    return f"{header}.{payload}.{b64(sig)}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--secret", required=True)
    ap.add_argument("--hours", type=int, default=6)
    args = ap.parse_args()
    ids = [line.strip() for line in sys.stdin if line.strip()]
    if not ids:
        sys.exit("No user ids on stdin. Run seed.sql first.")
    json.dump([{"id": i, "token": sign(i, args.secret, args.hours)} for i in ids], sys.stdout)


if __name__ == "__main__":
    main()
