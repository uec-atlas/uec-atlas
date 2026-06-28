#!/bin/bash
set -e

mkdir -p ./tmp_data
mkdir -p ./tdb2_data

JENA_VERSION="6.1.0"
jena="https://dlcdn.apache.org/jena/binaries/apache-jena-${JENA_VERSION}.zip"

if [ ! -d ./tmp_data/apache-jena-${JENA_VERSION} ]; then
  echo "=== Downloading Apache Jena ==="
  wget -q -c -P ./tmp_data "$jena"
  unzip -q "./tmp_data/apache-jena-${JENA_VERSION}.zip" -d ./tmp_data
  chmod +x "./tmp_data/apache-jena-${JENA_VERSION}/bin/tdb2.tdbloader"
fi

echo "=== Downloading RDF files via HTTP ==="

ATLAS_ORIGIN="https://uec-atlas.org"

urls=(
  "${ATLAS_ORIGIN}/data/organizations/all.nq"
  "${ATLAS_ORIGIN}/data/spatial/all.nq"
  "${ATLAS_ORIGIN}/data/education/courses.nq"
  "${ATLAS_ORIGIN}/data/education/categories.nq"
  "${ATLAS_ORIGIN}/data/education/curriculum.nq"
  "${ATLAS_ORIGIN}/data/education/lectures.nq"
  "${ATLAS_ORIGIN}/data/people/all.nq"
  "${ATLAS_ORIGIN}/ontology/organization.ttl"
  "${ATLAS_ORIGIN}/ontology/spatial.ttl"
  "${ATLAS_ORIGIN}/ontology/education.ttl"
  "${ATLAS_ORIGIN}/ontology/people.ttl"
)

for url in "${urls[@]}"; do
  dir_path="${url%/*}"
  dir_name="${dir_path##*/}"
  file_name="${url##*/}"
  echo "Fetching: $url"
  mkdir -p "./tmp_data/rdf/$dir_name"
  wget -q -c -O "./tmp_data/rdf/$dir_name/$file_name" "$url"
done

echo "=== Building TDB2 Index ==="

"./tmp_data/apache-jena-${JENA_VERSION}/bin/tdb2.tdbloader" --loc=./tdb2_data ./tmp_data/rdf/**/*
"./tmp_data/apache-jena-${JENA_VERSION}/bin/tdb2.tdbstats" --loc=./tdb2_data > ./tdb2_data/Data-0001/stats.opt

echo "=== Cleaning up temporary files ==="
rm -rf ./tmp_data

echo "TDB2 built successfully in ./tdb2_data"
