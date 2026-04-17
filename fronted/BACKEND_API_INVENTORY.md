# Backend API Inventory

This file records the backend interfaces currently exposed by the local NestJS service.
It is intended as the contract reference while the frontend stays aligned with the GitHub
repository UI baseline.

## Base Notes

- Backend source: `backend/crawler/src`
- Authenticated routes use the `/api` prefix from the frontend reverse proxy
- Current frontend style baseline: `origin/main` for `fronted`
- Backend code is intentionally left untouched during the frontend reset

## Public / Session

### User

- `POST /api/user/send-code`
- `POST /api/user/register`
- `POST /api/user/login`
- `POST /api/user/logout`
- `GET /api/user/profile`
- `PATCH /api/user/profile`
- `PATCH /api/user/password`
- `POST /api/user/avatar`
- `GET /api/user/captcha`

### Platform

- `GET /api/platform/info`

## Notifications

- `GET /api/notifications`
- `PUT /api/notifications/:notificationId/read`
- `PUT /api/notifications/read-all`

## Task Runtime

- `POST /api/task/preview-screenshot`
- `POST /api/task/list-preview`
- `POST /api/task/xpath-parse`
- `POST /api/task/xpath-match`
- `POST /api/task/xpath-parse-all`
- `POST /api/task/execute`
- `GET /api/task/engine-status`
- `GET /api/task/workspace-overview`
- `GET /api/task/organization-options`
- `PUT /api/task/:taskId/organization`
- `GET /api/task/list`
- `GET /api/task/execution-result/:executionId`
- `DELETE /api/task`
- `GET /api/task/statistics`
- `POST /api/task/package-result/:executionId`

## Task Templates

- `GET /api/task/templates`
- `GET /api/task/template-categories`
- `GET /api/task/templates/:templateId`
- `POST /api/task/templates`
- `POST /api/task/templates/from-task`
- `PUT /api/task/templates/:templateId`
- `DELETE /api/task/templates/:templateId`

## Admin

### Users

- `GET /api/admin/users`
- `POST /api/admin/users`
- `PUT /api/admin/users/:id`
- `DELETE /api/admin/users/:id`
- `PUT /api/admin/users/:id/toggle-status`

### Tasks

- `GET /api/admin/tasks`
- `PUT /api/admin/tasks/:id/stop`

### Logs

- `GET /api/admin/logs`
- `DELETE /api/admin/logs`

### Settings / Runtime

- `GET /api/admin/settings`
- `PUT /api/admin/settings`
- `GET /api/admin/system-info`

## CRUD Modules Still Present

- `POST /api/execution`
- `GET /api/execution`
- `GET /api/execution/:id`
- `PATCH /api/execution/:id`
- `DELETE /api/execution/:id`
- `POST /api/result`
- `GET /api/result`
- `GET /api/result/:id`
- `PATCH /api/result/:id`
- `DELETE /api/result/:id`

## Compatibility Notes

- The current backend no longer exposes a JSPath parse endpoint.
- Frontend task extraction should treat XPath as the supported selector path.
- Newer backend capabilities such as notifications, platform info, task templates,
  organization metadata, and workspace overview are recorded here even if the restored
  GitHub UI baseline does not surface every screen yet.
