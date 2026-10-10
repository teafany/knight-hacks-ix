# Trained Model Registry

This directory contains final trained checkpoints selected for GitHub publication,
plus their metadata, hashes and attribution. Training datasets, downloaded
initialization weights, environments, caches and temporary runs are not included.

| Model | Checkpoint | Size |
| --- | --- | ---: |
| Gauge detector (YOLO11n) | `gauge/yolo11n-best.pt` | 5,476,826 bytes |
| Yoke-suspension corrosion (ResNet18) | `corrosion/yoke-suspension/corrosion_20261010_212044/model.pt` | 44,779,339 bytes |

Both files are below GitHub's regular Git file limit; Git LFS is not required for
these checkpoints. Use terminal Git, not browser upload (the latter has a smaller
per-file limit). See [GitHub's file-size policy](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).
Avoid repeatedly committing large intermediate models. Future files above the
regular Git limit need Git LFS or release assets before publication.

`gauge/yolo11n-best.pt` is the actual 80-epoch AMD-trained gauge checkpoint returned by the user. `gauge/metadata.json` records its checksum, classes, reported detector metrics, and limitations. This is a detector, not independently validated numeric gauge accuracy.

The corrosion checkpoint's best validation epoch is 11 (not necessarily total
training length). It classified 17/17 rust validation crops correctly with one
false positive among 5,261 normal crops. There is no independent test score,
indoor-plant validation, defect localization or severity estimate. Its input must
be one manually supplied yoke-suspension crop. Neither model establishes safety.

`registry.json` lists the published checkpoints and hashes. The `.gitignore`
allows only these selected binary files; other checkpoint binaries remain ignored.
For a new final model, import it, add an explicit allow-rule and registry entry,
then verify before committing. Thermal training lives in the local
`thermal-training/` component.
Its importer adds a verified full-run checkpoint to this registry and the Git
allow-list automatically. `registry.json` records which models remain untrained.
The table above records the initial gauge/corrosion pair; `registry.json` is
authoritative for later imports. Dial-meter data requires the provider's agreement.

Acoustic training lives in local `acoustic-training/`. After its full-run
held-out-machine evaluation, the export/import flow adds only the trained model,
metadata, checksums, registry row and Git allow-rule. It recognizes pump audio
normal/anomalous reference patterns, not specific fault types or hazard severity.
The acoustic independent-test flag is limited to held-out machine ID 06, not a
new recording session/site. Input frontend is checkpoint-versioned and required
for compatible loading; use the local acoustic inference code rather than
feeding raw audio directly to ResNet18. No runtime downloads are needed.

The imported acoustic run `acoustic_resnet18_20261010_224835` is retained as an
experimental result, not a usable inspection model: held-out machine 06 balanced
accuracy is 50.8%, with 1,019 false positives among 1,036 normal clips. Full test
metrics remain in its original metadata. Publication records the experiment;
it does not assert that the model is reliable or suitable for deployment.

## Verify and Publish Only Models

From the project root:

```bash
git switch feat/ai-models
python3 models/verify_publish.py
git add -- models
git diff --cached --stat
```

Check that the staged list contains only `models/` before continuing. Do not use
`git add .`; it would also include unrelated local work. With a clean staged list:

```bash
git commit --only -m "Add trained gauge and corrosion models" -- models
git push -u origin feat/ai-models
```

The path-scoped commit keeps unrelated staged changes out of this commit. A push
also sends any earlier unpushed commits on the branch; inspect those first if
there are any. These instructions add only models to the existing repository;
they do not remove the challenge kit or other files already in Git history.
No commit or push is performed by the verification script.

## Load the Checkpoints

Gauge: load `gauge/yolo11n-best.pt` with the matching Ultralytics YOLO API and
apply a separately reviewed gauge calibration for numeric reading. Model labels
are Center, Gauge and Needle; Needle means the whole pointer, not a tip landmark.
Ultralytics checkpoints use Python serialization: load only trusted files after
checksum verification. Do not enable unsafe deserialization for arbitrary files.

Corrosion: construct torchvision `resnet18(weights=None)`, replace `fc` with
`Linear(512, 2)`, and load the checkpoint's `state_dict` with `weights_only=True`.
Class order is normal, corrosion. Input is RGB letterboxed to 224x224 with gray
padding (127,127,127), then normalized with ImageNet means (.485,.456,.406) and
standard deviations (.229,.224,.225). Softmax scores are not calibrated accuracy
or hazard severity. The checkpoint contains metadata as well as `state_dict`.

Compatible inference code remains locally in `gauge-training/` and
`inspection-training/`; a model-only commit does not publish those scripts.
See `ATTRIBUTION.md` and `licenses/` for upstream notices and restrictions.

Remote training does not automatically synchronize files to this Mac. Download
each final checkpoint/export through the server file browser and use the local
`inspection-training/import_model.py` for corrosion exports. Keep metadata and
checksums with the checkpoint.
