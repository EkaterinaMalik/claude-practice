# Allure CLI in a container, so viewing reports needs no local Java install.
# Pinned to 2.36.0 to match the CLI this project's allure-results are known to
# render correctly with (allure-playwright 3.x writes Allure 2-compatible results).
FROM eclipse-temurin:21-jre

ARG ALLURE_VERSION=2.36.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL -o /tmp/allure.tgz \
        "https://github.com/allure-framework/allure2/releases/download/${ALLURE_VERSION}/allure-${ALLURE_VERSION}.tgz" \
    && tar -xzf /tmp/allure.tgz -C /opt \
    && rm /tmp/allure.tgz \
    && ln -s "/opt/allure-${ALLURE_VERSION}/bin/allure" /usr/local/bin/allure

WORKDIR /work

# -h 0.0.0.0 is required: the default binds to localhost *inside* the container,
# which the published port on the host cannot reach.
CMD ["allure", "serve", "-h", "0.0.0.0", "-p", "5252", "/work/allure-results"]
