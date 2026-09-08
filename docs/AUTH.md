# Authentication & Access Model

## Core Philosophy

Unlike typical fitness applications, `light-weight` **deliberately does not feature public registration, social sign-ins, or guest onboarding**.

### Operator-Provisioned Model

1. **System Operator**:
   - The operator initializes the instance with an administrative master account.
   - The operator creates accounts for allowed users via an administrative interface or CLI script.
   
2. **User Credentials**:
   - Operator assigns a username/email and temporary or permanent password.
   - Users authenticate against `/api/auth/login`.

3. **Session & Security**:
   - HTTP-only secure cookies or Bearer JWT tokens.
   - Strict per-user row-level data scoping: every query is scoped to the authenticated `user_id`.
   - Admin roles can view user lists and provision accounts, but user workout data remains private.
