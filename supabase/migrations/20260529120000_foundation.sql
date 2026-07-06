create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app_private;

comment on schema app_private is 'Private database helpers and internal tables for Clinica RW.';

