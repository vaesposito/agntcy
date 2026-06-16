{{/*
Expand the name of the chart.
*/}}
{{- define "llm-wiki.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "llm-wiki.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label value (name-version).
*/}}
{{- define "llm-wiki.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "llm-wiki.labels" -}}
helm.sh/chart: {{ include "llm-wiki.chart" . }}
{{ include "llm-wiki.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels (subset of common labels; used in matchLabels).
*/}}
{{- define "llm-wiki.selectorLabels" -}}
app.kubernetes.io/name: {{ include "llm-wiki.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Internal URL for the backend service. Used by the backend ConfigMap (TTT_BACKEND_URL)
and the frontend ConfigMap (TTT_API_URL).
*/}}
{{- define "llm-wiki.backendUrl" -}}
{{- printf "http://%s-backend:%d" (include "llm-wiki.fullname" .) (.Values.service.backend.port | int) }}
{{- end }}

{{/*
Name of the Zalando postgresql CR (and its master Service).
*/}}
{{- define "llm-wiki.postgresCluster" -}}
{{- printf "%s-postgres" (include "llm-wiki.fullname" .) }}
{{- end }}

{{/*
Hostname of the PostgreSQL master. With the Zalando operator the master Service
has the same name as the CR — no "-rw" suffix (unlike CloudNativePG).
*/}}
{{- define "llm-wiki.postgresHost" -}}
{{- include "llm-wiki.postgresCluster" . }}
{{- end }}

{{/*
Name of the Zalando credentials Secret.
Format: {user}.{cluster-name}.credentials.postgresql.acid.zalan.do
The operator reads this secret on initdb; pre-creating it with a known password
lets us construct TTT_DATABASE_URL deterministically.
*/}}
{{- define "llm-wiki.postgresSecretName" -}}
{{- printf "%s.%s.credentials.postgresql.acid.zalan.do" .Values.postgres.user (include "llm-wiki.postgresCluster" .) }}
{{- end }}

{{/*
Name of the app Secret (API keys + database URL).
*/}}
{{- define "llm-wiki.appSecret" -}}
{{- printf "%s-secret" (include "llm-wiki.fullname" .) }}
{{- end }}

{{/*
Name of the ServiceAccount used by the backend (K8s agent orchestrator).
*/}}
{{- define "llm-wiki.serviceAccountName" -}}
{{- printf "%s-backend" (include "llm-wiki.fullname" .) }}
{{- end }}

{{/*
Namespace where agent Pods are created. Falls back to Release.Namespace.
*/}}
{{- define "llm-wiki.agentNamespace" -}}
{{- default .Release.Namespace .Values.rbac.agentNamespace }}
{{- end }}
