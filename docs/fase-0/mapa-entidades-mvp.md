# Mapa de Entidades do MVP

Este mapa define as entidades que devem nascer no MVP. Toda tabela operacional sensivel deve ter `organization_id`, RLS, timestamps e trilha de auditoria quando aplicavel.

## Plataforma e tenant

| Entidade                 | Papel                          | Campos chave                                                                                                               |
| ------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `organizations`          | tenant/clinica cliente         | `id`, `name`, `legal_name`, `document`, `status`, `plan_key`, `mode`, `created_at`                                         |
| `organization_settings`  | configuracoes gerais do tenant | `organization_id`, `timezone`, `locale`, `solo_mode`, `retention_policy_key`                                               |
| `audit_logs`             | trilha de auditoria            | `id`, `organization_id`, `actor_user_id`, `action`, `resource_type`, `resource_id`, `metadata`, `ip_address`, `created_at` |
| `impersonation_sessions` | suporte por super admin        | `id`, `super_admin_user_id`, `organization_id`, `target_user_id`, `reason`, `started_at`, `ended_at`                       |

## Identidade, permissao e escopo

| Entidade                    | Papel                            | Campos chave                                                                         |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `app_users`                 | usuarios internos e super admins | `id`, `organization_id`, `auth_user_id`, `name`, `email`, `status`, `is_super_admin` |
| `profiles`                  | perfis padrao/customizados       | `id`, `organization_id`, `name`, `description`, `is_system_default`                  |
| `permissions`               | catalogo de permissoes           | `id`, `code`, `category`, `description`                                              |
| `profile_permissions`       | N:N perfil/permissao             | `profile_id`, `permission_id`                                                        |
| `user_profiles`             | N:N usuario/perfil               | `user_id`, `profile_id`                                                              |
| `user_permission_overrides` | excecoes individuais             | `user_id`, `permission_id`, `granted`                                                |
| `resource_scopes`           | escopo por recurso               | `id`, `user_id`, `resource_type`, `resource_id`, `access_level`                      |

## Cadastros base

| Entidade            | Papel                           | Campos chave                                                                                      |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `clinics`           | dados institucionais da clinica | `organization_id`, `trade_name`, `legal_name`, `document`, `phone`, `email`                       |
| `units`             | unidades fisicas                | `id`, `organization_id`, `name`, `address`, `active`                                              |
| `rooms`             | salas/consultorios              | `id`, `organization_id`, `unit_id`, `name`, `active`                                              |
| `professionals`     | profissionais de saude          | `id`, `organization_id`, `user_id`, `name`, `council`, `council_number`, `specialty_id`, `active` |
| `specialties`       | especialidades                  | `id`, `organization_id`, `name`, `cbo_code`, `active`                                             |
| `procedures`        | procedimentos/servicos          | `id`, `organization_id`, `name`, `duration_minutes`, `price`, `active`                            |
| `health_insurances` | convenios simples               | `id`, `organization_id`, `name`, `document`, `active`                                             |
| `business_hours`    | horarios de funcionamento       | `id`, `organization_id`, `resource_type`, `resource_id`, `weekday`, `start_time`, `end_time`      |

## Pacientes e CRM base

| Entidade                     | Papel                      | Campos chave                                                                                        |
| ---------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `patients`                   | ficha principal            | `id`, `organization_id`, `full_name`, `birth_date`, `cpf`, `email`, `phone`, `status`, `deleted_at` |
| `patient_addresses`          | enderecos                  | `id`, `organization_id`, `patient_id`, `postal_code`, `street`, `city`, `state`                     |
| `patient_clinical_summaries` | dados clinicos permanentes | `patient_id`, `allergies`, `comorbidities`, `medications`, `history`, `habits`, `emergency_contact` |
| `patient_consents`           | consentimentos LGPD        | `id`, `organization_id`, `patient_id`, `type`, `version`, `accepted_at`, `revoked_at`               |
| `tags`                       | tags simples               | `id`, `organization_id`, `name`, `color`                                                            |
| `patient_tags`               | N:N paciente/tag           | `patient_id`, `tag_id`                                                                              |

## Agenda

| Entidade                    | Papel                             | Campos chave                                                                                                                       |
| --------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `schedules`                 | agenda de um profissional/recurso | `id`, `organization_id`, `professional_id`, `unit_id`, `name`, `color`, `active`                                                   |
| `schedule_availability`     | disponibilidade recorrente        | `id`, `organization_id`, `schedule_id`, `weekday`, `start_time`, `end_time`, `slot_minutes`                                        |
| `schedule_blocks`           | bloqueios e folgas                | `id`, `organization_id`, `schedule_id`, `start_at`, `end_at`, `reason`                                                             |
| `appointments`              | agendamentos                      | `id`, `organization_id`, `patient_id`, `professional_id`, `procedure_id`, `schedule_id`, `room_id`, `status`, `start_at`, `end_at` |
| `appointment_status_events` | historico de status               | `id`, `organization_id`, `appointment_id`, `from_status`, `to_status`, `actor_user_id`, `created_at`                               |
| `waitlist_entries`          | lista de espera simples           | `id`, `organization_id`, `patient_id`, `procedure_id`, `preferred_period`, `status`                                                |

## Prontuario e atendimento

| Entidade                     | Papel                       | Campos chave                                                                                                                              |
| ---------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `clinical_templates`         | template logico             | `id`, `organization_id`, `name`, `specialty_id`, `status`                                                                                 |
| `clinical_template_versions` | versao imutavel do template | `id`, `organization_id`, `template_id`, `version_number`, `schema`, `published_at`                                                        |
| `encounters`                 | atendimento clinico         | `id`, `organization_id`, `patient_id`, `professional_id`, `appointment_id`, `template_version_id`, `status`, `started_at`, `finalized_at` |
| `encounter_entries`          | conteudo preenchido         | `id`, `organization_id`, `encounter_id`, `template_snapshot`, `structured_data`, `free_notes`                                             |
| `encounter_addenda`          | adendos pos-finalizacao     | `id`, `organization_id`, `encounter_id`, `author_user_id`, `content`, `created_at`                                                        |
| `clinical_attachments`       | anexos clinicos             | `id`, `organization_id`, `patient_id`, `encounter_id`, `storage_path`, `mime_type`, `created_at`                                          |

## Documentos clinicos

| Entidade             | Papel                 | Campos chave                                                                                                                |
| -------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `document_templates` | modelos reutilizaveis | `id`, `organization_id`, `type`, `name`, `body_schema`, `active`                                                            |
| `clinical_documents` | documentos emitidos   | `id`, `organization_id`, `patient_id`, `professional_id`, `encounter_id`, `type`, `status`, `pdf_storage_path`, `issued_at` |

## Financeiro operacional

| Entidade               | Papel                              | Campos chave                                                                                                |
| ---------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `payment_methods`      | formas de pagamento                | `id`, `organization_id`, `name`, `type`, `active`                                                           |
| `financial_categories` | categorias simples                 | `id`, `organization_id`, `name`, `type`                                                                     |
| `accounts_receivable`  | contas a receber                   | `id`, `organization_id`, `patient_id`, `appointment_id`, `amount`, `due_date`, `status`                     |
| `accounts_payable`     | contas a pagar                     | `id`, `organization_id`, `supplier_name`, `amount`, `due_date`, `status`, `category_id`                     |
| `payments`             | recebimentos/pagamentos realizados | `id`, `organization_id`, `account_receivable_id`, `payment_method_id`, `amount`, `paid_at`, `actor_user_id` |
| `professional_payouts` | repasse simples                    | `id`, `organization_id`, `professional_id`, `appointment_id`, `amount`, `status`                            |

## Regras transversais

- Toda tabela multi-tenant usa `organization_id`.
- RLS e obrigatorio antes de qualquer tela consumir a tabela.
- Conteudo clinico deve ser separado de metadados sempre que possivel.
- Registros clinicos finalizados nao sao editados; correcoes viram adendos.
- Auditoria cobre autenticacao, acesso clinico, alteracao clinica, financeiro, permissao, escopo e impersonacao.
