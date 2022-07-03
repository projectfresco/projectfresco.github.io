#!/bin/sh

echo "Initializing subtree - Fresco (main)"
git merge -s ours --no-commit --allow-unrelated-histories fresco-main/master
git read-tree --prefix=".base/fresco-main" -u fresco-main/master
git commit -m "Merge fresco-main project"

echo "Initializing subtree - Fresco (content)"
git merge -s ours --no-commit --allow-unrelated-histories fresco-content/master
git read-tree --prefix=".base/fresco-content" -u fresco-content/master
git commit -m "Merge fresco-content project"
