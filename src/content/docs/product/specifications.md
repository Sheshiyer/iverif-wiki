---
title: Technical Specifications
description: System requirements, security, compliance, and technical architecture for iverif.io.
category: product
tags:
- product
- specifications
- technical
sources: []
lastUpdated: '2026-06-04'
order: 3
icon: ""
---

# Technical Specifications

## System Architecture

iverif.io runs on a cloud-native architecture designed for security, scalability, and regulatory compliance.

**Backend:** Python-based microservices with async processing pipelines
**Frontend:** React with TypeScript for the operator dashboard
**AI Engine:** Proprietary document validation models trained on EU energy subsidy regulations
**Database:** Encrypted at rest, with full audit logging

---

## Security & Compliance

| Standard | Status |
|----------|--------|
| GDPR | Fully compliant — data processing agreements available |
| ISO 27001 | Certified infrastructure |
| SOC 2 Type II | Audited annually |
| EU Data Residency | All data stored within EU boundaries |

**Encryption:**
- TLS 1.3 for data in transit
- AES-256 for data at rest
- End-to-end encryption for sensitive document fields

---

## Performance

| Metric | Target |
|--------|--------|
| Dossier processing time | < 5 minutes for standard 10-20 document sets |
| Uptime SLA | 99.9% |
| API response time | < 200ms for validation queries |
| Concurrent processing | Unlimited queue with auto-scaling |

---

## Integration Requirements

**API:** RESTful JSON API with OpenAPI documentation
**Authentication:** OAuth 2.0 + SAML 2.0 for SSO
**Webhooks:** HTTPS endpoints for real-time event notification
**File formats:** PDF, JPEG, PNG, TIFF (OCR enabled)

---

## Deployment Options

1. **Cloud SaaS** — Fully managed, multi-tenant (default)
2. **Dedicated Cloud** — Single-tenant managed instance
3. **On-Premise** — For organizations with strict data sovereignty requirements

---

## Support

| Level | Response Time |
|-------|---------------|
| Standard | Business hours, 24h response |
| Premium | 24/7, 4h response |
| Enterprise | 24/7, 1h response with dedicated account manager |