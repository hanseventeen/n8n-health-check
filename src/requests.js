'use strict';

/*
 * Every call the health check makes to the n8n API, in one place.
 * The n8n workflow and any runner must only use these.
 * test/safety.test.js fails if anything here could change the instance.
 */

const API_CALLS = [
  {
    id: 'list-workflows',
    method: 'GET',
    path: '/api/v1/workflows',
    query: { limit: 250, excludePinnedData: true },
    paged: true,
  },
  {
    id: 'list-executions',
    method: 'GET',
    path: '/api/v1/executions',
    // startedAfter is filled in at run time (now minus the failure window).
    query: { limit: 250, includeData: false },
    paged: true,
  },
  {
    id: 'security-audit',
    // POST, but it only builds a report. It changes nothing on the instance.
    method: 'POST',
    path: '/api/v1/audit',
    body: { additionalOptions: { categories: ['instance', 'nodes'] } },
    paged: false,
  },
];

// The scopes the API key needs. Nothing that writes.
const REQUIRED_SCOPES = ['workflow:read', 'execution:read', 'securityAudit:generate'];

module.exports = { API_CALLS, REQUIRED_SCOPES };
