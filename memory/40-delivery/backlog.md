# Backlog

Priorizacao via RICE (Reach x Impact x Confidence / Effort).

Assumptions: 1 usuario, ~5 empresas, ~60 ativos, 2 NAS.

| Prioridade | Item | Reach | Impact | Confidence | Effort | RICE | Dependencias | Notas |
|---|---:|---:|---:|---:|---:|---:|---|---|
| P0 | Inventario multiempresa + CRUD de ativos | 60 | 3.0 | 0.8 | 6 | 24.0 | - | Base do sistema |
| P0 | Monitoramento de disponibilidade + status | 60 | 3.0 | 0.7 | 8 | 15.8 | Inventario | Checks ICMP/TCP |
| P1 | Alertas (regras + notificacao) | 60 | 2.0 | 0.7 | 6 | 14.0 | Monitoramento | SLA alerta <= 2 min |
| P1 | Storage/NAS (capacidade/uso) | 10 | 2.0 | 0.6 | 4 | 3.0 | Inventario | Medir volumes |
| P2 | Relatorios mensais + export CSV | 5 | 1.5 | 0.6 | 4 | 1.1 | Monitoramento | Foco em uptime |
| P2 | Deploy Dokploy + Debian 13 | 1 | 2.5 | 0.8 | 3 | 0.7 | - | Bloqueador de validacao final |
| P3 | Observabilidade (Prometheus/Grafana) | 1 | 2.0 | 0.6 | 3 | 0.4 | Monitoramento | /metrics + dashboard |
