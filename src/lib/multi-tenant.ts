/**
 * Multi-tenant configuration.
 *
 * IS_MULTI_TENANT=false (default) → Personal / self-hosted mode
 *   - No public signup
 *   - First user seeded as admin
 *   - Single workspace
 *
 * IS_MULTI_TENANT=true → SaaS mode
 *   - Public signup available
 *   - First user becomes Super Admin
 *   - Organizations, billing, team management
 */
export const isMultiTenant = process.env.IS_MULTI_TENANT === "true"
