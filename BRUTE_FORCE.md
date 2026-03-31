# Brute Force Program (Admin Frontend)

## Current controls
- No password form in this frontend.
- Operator provides `X-Admin-Token` manually.
- Token is only used for authenticated admin API calls.

## Client-side safeguards
- No automatic retry loop for failed auth requests.
- API errors are surfaced and require manual operator action.

## Recommended hardening
- Avoid sharing browser profile between admins.
- Use short-lived token strategy in backend/gateway.
- Keep admin UI behind trusted network and MFA (IdP/Gateway).

## Update protocol
Whenever admin auth flow changes, update:
1. `BRUTE_FORCE.md` (this repo)
2. `README.md` auth notes
3. Workspace `BRUTE_FORCE.md`
