from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import HealthSerializer


class HealthView(APIView):
    """Report that the local API process is responding."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        serializer = HealthSerializer({'status': 'ok', 'service': 'server'})
        return Response(serializer.data)
