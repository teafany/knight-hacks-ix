from django.conf import settings
from django.core.files.uploadhandler import FileUploadHandler
from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework.exceptions import ParseError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .inference_serializers import (
    AcousticSerializer, CorrosionFrameSerializer, FrameSerializer,
    InferenceErrorSerializer, InferenceModelSerializer, InferenceResultSerializer,
    ThermalFrameSerializer,
)
from .services.inference import InferenceBusy, InferenceUnavailable, infer, list_models


class LimitedUploadHandler(FileUploadHandler):
    """Bound file bytes while parsing, before a large upload reaches disk."""

    def __init__(self, request):
        super().__init__(request)
        self.received = 0

    def receive_data_chunk(self, raw_data, start):
        self.received += len(raw_data)
        if self.received > settings.INFERENCE_MAX_UPLOAD_BYTES:
            raise ParseError('Upload exceeds the 8 MiB limit.')
        return raw_data

    def file_complete(self, file_size):
        return None


class InferenceModelsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses={200: InferenceModelSerializer(many=True), 503: InferenceErrorSerializer}, tags=['Inference'])
    def get(self, request):
        try:
            return Response(list_models())
        except InferenceUnavailable as exc:
            return Response({'detail': str(exc)}, status=503)


RESPONSES = {
    200: InferenceResultSerializer,
    400: OpenApiResponse(description='Invalid input; fields contain validation messages or detail contains a decoding error.'),
    429: OpenApiResponse(InferenceErrorSerializer, description='Worker busy. Retry after one second; drop stale frames.'),
    503: OpenApiResponse(InferenceErrorSerializer, description='Model or inference runtime unavailable.'),
}


class FrameInferenceView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser]
    serializer_class = FrameSerializer
    kind = None

    def initialize_request(self, request, *args, **kwargs):
        request.upload_handlers.insert(0, LimitedUploadHandler(request))
        return super().initialize_request(request, *args, **kwargs)

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = infer(self.kind, serializer.validated_data)
        except InferenceBusy as exc:
            return Response({'detail': str(exc)}, status=429, headers={'Retry-After': '1'})
        except InferenceUnavailable as exc:
            return Response({'detail': str(exc)}, status=503)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response(InferenceResultSerializer(result).data)


class GaugeInferenceView(FrameInferenceView):
    kind = 'gauge'

    @extend_schema(request=FrameSerializer, responses=RESPONSES, tags=['Inference'],
                   summary='Detect gauge, center and whole pointer in a camera frame',
                   description='Stateless JPEG/PNG upload. Returns boxes, not a numeric gauge reading. No calibration is inferred.')
    def post(self, request):
        return super().post(request)


class CorrosionInferenceView(FrameInferenceView):
    kind = 'corrosion'
    serializer_class = CorrosionFrameSerializer

    @extend_schema(request=CorrosionFrameSerializer, responses=RESPONSES, tags=['Inference'],
                   summary='Classify a supplied yoke-suspension asset crop',
                   description='Stateless frame upload with asset_crop=true or a JSON ROI. ROI describes the asset, not a localized defect.')
    def post(self, request):
        return super().post(request)


class ThermalInferenceView(FrameInferenceView):
    kind = 'thermal'
    serializer_class = ThermalFrameSerializer

    @extend_schema(request=ThermalFrameSerializer, responses=RESPONSES, tags=['Inference'],
                   summary='Classify a compatible motor thermogram frame',
                   description='Requires compatible_thermogram=true. Visible-light cameras cannot measure temperature or supply thermal input.')
    def post(self, request):
        return super().post(request)


class AcousticInferenceView(FrameInferenceView):
    kind = 'acoustic'
    serializer_class = AcousticSerializer

    @extend_schema(request=AcousticSerializer, responses=RESPONSES, tags=['Inference'],
                   summary='Evaluate one complete ten-second pump audio window (experimental)',
                   description='Requires compatible_pump_audio=true and allow_experimental=true. Every result requires review due to poor held-out-machine performance.')
    def post(self, request):
        return super().post(request)
