FROM alpine:3.24 AS builder

RUN apk add --no-cache openjdk21-jdk bash

WORKDIR /app

COPY gradlew build.gradle /app/
COPY gradle /app/gradle
COPY build-tdb2.sh /app/
COPY ./src /app/src

RUN chmod +x ./gradlew && ./gradlew build
RUN chmod +x ./build-tdb2.sh && ./build-tdb2.sh

FROM alpine:3.24
RUN apk add --no-cache openjdk21-jre-headless bash
WORKDIR /app

COPY --from=builder /app/build/distributions /app/distributions
COPY --from=builder /app/tdb2_data /app/tdb2_data

ARG DATA_VERSION=dev
ENV DATA_VERSION=${DATA_VERSION}

EXPOSE 3000
CMD ["java", "-Xms64m", "-Xmx256m", "-jar", "distributions/app.jar"]
