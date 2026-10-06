# The wallet API as a container, which is how Render runs a JVM service.
#
# Two stages: Maven compiles where a JDK and a cache live, the release carries only a
# JRE and the jar. The integration tests are skipped at build time because every one of
# them needs a SQL Server instance (wallet_test) that a build machine does not have;
# they run against a real database in CI or on a workstation, never here.

FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /src

# Dependencies resolve from the pom alone, so this layer survives every source edit.
COPY backend/pom.xml ./pom.xml
RUN mvn -B -ntp dependency:go-offline

COPY backend/src ./src
RUN mvn -B -ntp package -DskipTests

FROM eclipse-temurin:17-jre AS release
WORKDIR /app

# One directory the process may write to, and it is the identity scans. The service
# stores nothing else on disk; the ledger is entirely in SQL Server.
RUN useradd --system --create-home --home-dir /app --shell /usr/sbin/nologin wallet \
 && mkdir -p /app/var/kyc-documents \
 && chown -R wallet:wallet /app
COPY --from=build --chown=wallet:wallet /src/target/*.jar /app/api.jar

USER wallet

# Render sets PORT; the application reads it before SERVER_PORT.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -Djava.security.egd=file:/dev/urandom" \
    KYC_DOC_STORAGE_DIR=/app/var/kyc-documents

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/api.jar"]
