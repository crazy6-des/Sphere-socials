# Sphere PR2 — CPAlead + CPAGrip integration

This branch is for implementation and verification only. Production `main` remains untouched until the earning flow is proven end-to-end.

## Provider slots
- Provider 1: CPAlead
- Provider 2: CPAGrip
- Provider 3: reserved
- Provider 4: reserved
- Provider 5: reserved

## Verification gates
1. Provider-specific callback validation/authentication
2. Valid Sphere-user resolution from provider user identifier
3. Database-level conversion idempotency
4. Reward ledger crediting
5. Reversal/chargeback handling
6. Configurable provider-payout → Sphere-points conversion
7. Withdrawal eligibility and minimum threshold checks
8. Fraud/sanity checks; frontend cannot directly credit rewards
9. Success, duplicate, invalid, and reversal test cases
10. Final end-to-end proof before merge/deploy

## Deployment rule
No production Netlify deployment is required for PR2. Merge to `main` only after the above gates pass and the provider dashboard callback contracts have been verified.
