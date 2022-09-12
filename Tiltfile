# This Tiltfile contains the deployment and build config for the Wormhole devnet.
#
#  We use Buildkit cache mounts and careful layering to avoid unnecessary rebuilds - almost
#  all source code changes result in small, incremental rebuilds. Dockerfiles are written such
#  that, for example, changing the contract source code won't cause Solana itself to be rebuilt.
#

load("ext://namespace", "namespace_create", "namespace_inject")
load("ext://secret", "secret_yaml_generic")

allow_k8s_contexts("ci")

# Disable telemetry by default
analytics_settings(False)

# Moar updates (default is 3)
update_settings(max_parallel_updates = 10)

# Runtime configuration
config.define_bool("ci", False, "We are running in CI")
config.define_bool("manual", False, "Set TRIGGER_MODE_MANUAL by default")

config.define_string("num", False, "Number of guardian nodes to run")

# You do not usually need to set this argument - this argument is for debugging only. If you do use a different
# namespace, note that the "wormhole" namespace is hardcoded in tests and don't forget specifying the argument
# when running "tilt down".
#
config.define_string("namespace", False, "Kubernetes namespace to use")

# These arguments will enable writing Guardian events to a cloud BigTable instance.
# Writing to a cloud BigTable is optional. These arguments are not required to run the devnet.
config.define_string("gcpProject", False, "GCP project ID for BigTable persistence")
config.define_string("bigTableKeyPath", False, "Path to BigTable json key file")

# When running Tilt on a server, this can be used to set the public hostname Tilt runs on
# for service links in the UI to work.
config.define_string("webHost", False, "Public hostname for port forwards")

# Components
config.define_bool("spy_relayer", False, "Enable spy relayer")
config.define_bool("guardiand_debug", False, "Enable dlv endpoint for guardiand")

cfg = config.parse()
num_guardians = int(cfg.get("num", "1"))
namespace = cfg.get("namespace", "wormhole")
gcpProject = cfg.get("gcpProject", "local-dev")
bigTableKeyPath = cfg.get("bigTableKeyPath", "./event_database/devnet_key.json")
webHost = cfg.get("webHost", "localhost")
ci = cfg.get("ci", False)
spy_relayer = cfg.get("spy_relayer", ci)
guardiand_debug = cfg.get("guardiand_debug", False)

bridge_ui_hot = not ci

if cfg.get("manual", False):
    trigger_mode = TRIGGER_MODE_MANUAL
else:
    trigger_mode = TRIGGER_MODE_AUTO

# namespace

if not ci:
    namespace_create(namespace)

def k8s_yaml_with_ns(objects):
    return k8s_yaml(namespace_inject(objects, namespace))

# protos

proto_deps = ["./proto", "buf.yaml", "buf.gen.yaml"]

local_resource(
    name = "proto-gen",
    deps = proto_deps,
    cmd = "tilt docker build -- --target go-export -f Dockerfile.proto -o type=local,dest=node .",
    env = {"DOCKER_BUILDKIT": "1"},
    labels = ["protobuf"],
    allow_parallel = True,
    trigger_mode = trigger_mode,
)

local_resource(
    name = "proto-gen-web",
    deps = proto_deps + ["buf.gen.web.yaml"],
    resource_deps = ["proto-gen"],
    cmd = "tilt docker build -- --target node-export -f Dockerfile.proto -o type=local,dest=. .",
    env = {"DOCKER_BUILDKIT": "1"},
    labels = ["protobuf"],
    allow_parallel = True,
    trigger_mode = trigger_mode,
)

local_resource(
    name = "const-gen",
    deps = ["scripts", "clients", "ethereum/.env.test"],
    cmd = 'tilt docker build -- --target const-export -f Dockerfile.const -o type=local,dest=. --build-arg num_guardians=%s .' % (num_guardians),
    env = {"DOCKER_BUILDKIT": "1"},
    allow_parallel = True,
    trigger_mode = trigger_mode,
)

docker_build(
    ref = "guardiand-image",
    context = "node",
    dockerfile = "node/Dockerfile",
    target = "build",
)

def command_with_dlv(argv):
    return [
        "/dlv",
        "--listen=0.0.0.0:2345",
        "--accept-multiclient",
        "--headless=true",
        "--api-version=2",
        "--continue=true",
        "exec",
        argv[0],
        "--",
    ] + argv[1:]

def build_node_yaml():
    node_yaml = read_yaml_stream("devnet/node.yaml")

    for obj in node_yaml:
        if obj["kind"] == "StatefulSet" and obj["metadata"]["name"] == "guardian":
            obj["spec"]["replicas"] = num_guardians
            container = obj["spec"]["template"]["spec"]["containers"][0]
            if container["name"] != "guardiand":
                fail("container 0 is not guardiand")
            container["command"] += ["--devNumGuardians", str(num_guardians)]

            if guardiand_debug:
                container["command"] = command_with_dlv(container["command"])
                container["command"] += ["--logLevel=debug"]
                print(container["command"])

    return encode_yaml_stream(node_yaml)

k8s_yaml_with_ns(build_node_yaml())

guardian_resource_deps = ["proto-gen"]

k8s_resource(
    "guardian",
    resource_deps = guardian_resource_deps,
    port_forwards = [
        port_forward(6060, name = "Debug/Status Server [:6060]", host = webHost),
        port_forward(7070, name = "Public gRPC [:7070]", host = webHost),
        port_forward(7071, name = "Public REST [:7071]", host = webHost),
        port_forward(2345, name = "Debugger [:2345]", host = webHost),
    ],
    labels = ["guardian"],
    trigger_mode = trigger_mode,
)

# guardian set update - triggered by "tilt args" changes
if num_guardians >= 2 and ci == False:
    local_resource(
        name = "guardian-set-update",
        resource_deps = guardian_resource_deps + ["guardian"],
        deps = ["scripts/send-vaa.sh", "clients/eth"],
        cmd = './scripts/update-guardian-set.sh %s %s %s' % (num_guardians, webHost, namespace),
        labels = ["guardian"],
        trigger_mode = trigger_mode,
    )

# spy
k8s_yaml_with_ns("swim_testnet/spy.yaml")

k8s_resource(
    "spy",
    resource_deps = ["proto-gen", "guardian"],
    port_forwards = [
        port_forward(6061, container_port = 6060, name = "Debug/Status Server [:6061]", host = webHost),
        port_forward(7072, name = "Spy gRPC [:7072]", host = webHost),
    ],
    labels = ["guardian"],
    trigger_mode = trigger_mode,
)

if spy_relayer:
    docker_build(
        ref = "redis",
        context = ".",
        only = ["./third_party"],
        dockerfile = "third_party/redis/Dockerfile",
    )

    k8s_yaml_with_ns("swim_testnet/redis.yaml")

    k8s_resource(
        "redis",
        port_forwards = [
            port_forward(6379, name = "Redis Default [:6379]", host = webHost),
        ],
        labels = ["spy-relayer"],
        trigger_mode = trigger_mode,
    )

    docker_build(
        ref = "spy-relay-image",
        context = ".",
        only = ["./relayer/spy_relayer"],
        dockerfile = "relayer/spy_relayer/Dockerfile",
        live_update = []
    )

    k8s_yaml_with_ns("swim_testnet/spy-listener.yaml")

    k8s_resource(
        "spy-listener",
        resource_deps = ["proto-gen", "guardian", "redis"],
        port_forwards = [
            port_forward(6062, container_port = 6060, name = "Debug/Status Server [:6062]", host = webHost),
            port_forward(4201, name = "REST [:4201]", host = webHost),
            port_forward(8082, name = "Prometheus [:8082]", host = webHost),
        ],
        labels = ["spy-relayer"],
        trigger_mode = trigger_mode,
    )

    k8s_yaml_with_ns("swim_testnet/spy-relayer.yaml")

    k8s_resource(
        "spy-relayer",
        resource_deps = ["proto-gen", "guardian", "redis"],
        port_forwards = [
            port_forward(8083, name = "Prometheus [:8083]", host = webHost),
        ],
        labels = ["spy-relayer"],
        trigger_mode = trigger_mode,
    )

    k8s_yaml_with_ns("swim_testnet/spy-wallet-monitor.yaml")

    k8s_resource(
        "spy-wallet-monitor",
        resource_deps = ["proto-gen", "guardian", "redis"],
        port_forwards = [
            port_forward(8084, name = "Prometheus [:8084]", host = webHost),
        ],
        labels = ["spy-relayer"],
        trigger_mode = trigger_mode,
    )
