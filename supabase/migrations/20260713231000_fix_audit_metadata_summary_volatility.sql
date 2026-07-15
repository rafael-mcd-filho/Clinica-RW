-- jsonb_build_object uses polymorphic value conversion and is classified as
-- STABLE by PostgreSQL. Match the wrapper volatility to its implementation so
-- the audit helper is not incorrectly constant-folded.

alter function app_private.audit_metadata_summary(jsonb) stable;
