# Upstream Attribution

These checkpoints are user-trained inspection prototypes, not endorsed by the
upstream authors. Model publication does not establish commercial-use clearance.
No physical robot was used. This directory does not include training images.

## Gauge Detector

YOLO11 by Glenn Jocher and Jing Qiu (2024),
https://github.com/ultralytics/ultralytics . Initialization: official YOLO11n
COCO-pretrained weights, https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt .
Ultralytics publishes AGPL-3.0 and alternative Enterprise terms. No Enterprise
license is bundled or asserted. Original AGPL text is retained in `licenses/`.
https://docs.ultralytics.com/models/yolo11/ .

Training images: Analog Gauge Meter by Roboflow workspace yolo-lxxyl, version 13
(v06-crop), https://universe.roboflow.com/yolo-lxxyl/analog-gauge-meter/dataset/13 .
The downloaded archive declares CC BY 4.0 and identifies its contributor as
"a Roboflow user". Original dataset attribution and license are retained in
`licenses/`. The trained gauge detector does not independently establish numeric
reading accuracy. Its Needle label encloses the whole pointer and counterweight.

## Corrosion Classifier

Training images: Vieira-e-Silva, Felix, Simoes and Teichrieb, *InsPLAD: A Dataset
and Benchmark for Power Line Asset Inspection in UAV Images*, v1,
DOI 10.17632/5n3fjgvfyz.1,
https://data.mendeley.com/datasets/5n3fjgvfyz/1 and
https://github.com/andreluizbvs/InsPLAD . Dataset license: CC BY-NC 3.0,
https://creativecommons.org/licenses/by-nc/3.0/ . Do not assume commercial rights.

Selected yoke-suspension image-level good/rust labels were mapped to
normal/corrosion. The train split was retained. 484 validation images sharing
training source frames or exact images were quarantined. Final validation counts
are 5,261 normal and 17 corrosion crops; no independent test is available.

Architecture/initialization: torchvision ResNet18, ImageNet-pretrained weights
from https://download.pytorch.org/models/resnet18-f37072fd.pth .
Torchvision code BSD-3-Clause notice is retained in `licenses/`; this is not a
blanket license for underlying ImageNet data or for these fine-tuned weights.
https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.resnet18.html .
No indoor-plant, severity or defect-localization validation is asserted.
