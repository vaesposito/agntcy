#!/bin/sh
# Copyright © 2025 Cisco Systems, Inc. and its affiliates.
# All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# This is a script to create a local kind cluster with a local container registry.
# It defaults to using the same kind cluster name as the helm chart testing and
# can be used instead of "task kind:create" in the "charts" directory.
#
# Taken from https://kind.sigs.k8s.io/docs/user/local-registry/

set -o errexit

CLUSTER_NAME=${CLUSTER_NAME:-llm-wiki-local}

# 1. Create registry container unless it already exists
DOCKER_REGISTRY_NAME=${DOCKER_REGISTRY_NAME:-kind-registry}
DOCKER_REGISTRY_PORT=${DOCKER_REGISTRY_PORT:-5001}
if [ "$(docker inspect -f '{{.State.Running}}' "${DOCKER_REGISTRY_NAME}" 2>/dev/null || true)" != 'true' ]; then
  docker run \
    -d --restart=always -p "127.0.0.1:${DOCKER_REGISTRY_PORT}:5000" --network bridge --name "${DOCKER_REGISTRY_NAME}" \
    registry:2
fi

# 2. Create kind cluster with containerd registry config dir enabled
#
# NOTE: the containerd config patch is not necessary with images from kind v0.27.0+
# It may enable some older images to work similarly.
# If you're only supporting newer relases, you can just use `kind create cluster` here.
#
# See:
# https://github.com/kubernetes-sigs/kind/issues/2875
# https://github.com/containerd/containerd/blob/main/docs/cri/config.md#registry-configuration
# See: https://github.com/containerd/containerd/blob/main/docs/hosts.md
if { kind get clusters | grep -q "$(CLUSTER_NAME)" ; } ; then
  echo "Cluster ${CLUSTER_NAME} already exists, skipping cluster creation."
else
  echo "Creating cluster ${CLUSTER_NAME}..."
  kind create cluster --name "${CLUSTER_NAME}" --config=kind-config.yaml --wait 5m
fi

# 3. Add the registry config to the nodes
#
# This is necessary because localhost resolves to loopback addresses that are
# network-namespace local.
# In other words: localhost in the container is not localhost on the host.
#
# We want a consistent name that works from both ends, so we tell containerd to
# alias localhost:${DOCKER_REGISTRY_PORT} to the registry container when pulling images
REGISTRY_DIR="/etc/containerd/certs.d/localhost:${DOCKER_REGISTRY_PORT}"
for node in $(kind get nodes --name "${CLUSTER_NAME}"); do
  docker exec "${node}" mkdir -p "${REGISTRY_DIR}"
  cat <<EOF | docker exec -i "${node}" cp /dev/stdin "${REGISTRY_DIR}/hosts.toml"
[host."http://${DOCKER_REGISTRY_NAME}:5000"]
EOF
done

# 4. Connect the registry to the cluster network if not already connected
# This allows kind to bootstrap the network but ensures they're on the same network
if [ "$(docker inspect -f='{{json .NetworkSettings.Networks.kind}}' "${DOCKER_REGISTRY_NAME}")" = 'null' ]; then
  docker network connect "kind" "${DOCKER_REGISTRY_NAME}"
fi

# 5. Document the local registry
# https://github.com/kubernetes/enhancements/tree/master/keps/sig-cluster-lifecycle/generic/1755-communicating-a-local-registry
cat <<EOF | kubectl --context kind-${CLUSTER_NAME} apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: local-registry-hosting
  namespace: kube-public
data:
  localRegistryHosting.v1: |
    host: "localhost:${DOCKER_REGISTRY_PORT}"
    help: "https://kind.sigs.k8s.io/docs/user/local-registry/"
EOF

# The registry can be used like this.
#
# First we’ll pull an image docker pull gcr.io/google-samples/hello-app:1.0
# Then we’ll tag the image to use the local registry docker tag gcr.io/google-samples/hello-app:1.0 localhost:5001/hello-app:1.0
# Then we’ll push it to the registry docker push localhost:5001/hello-app:1.0
# And now we can use the image kubectl create deployment hello-server --image=localhost:5001/hello-app:1.0
# If you build your own image and tag it like localhost:5001/image:foo and then use it in kubernetes as localhost:5001/image:foo.
