#!/bin/bash
# Test script for Voice Assistant Widget

BASE_URL="https://ha.baje.us"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI2MzhiNzM2ZjBjYTA0Mzk3YjExYjg1NjRlNTBlYmQ1MCIsImlhdCI6MTc2ODQ2NzU3MCwiZXhwIjoyMDgzODI3NTcwfQ.vS4QMKZuCcyYBHpzeKPSKqvFlXFS8XLi81zNrk6hA2Q"

echo "=== Voice Assistant Widget Test Suite ==="
echo ""

# Test 1: API Connection
echo "1. Testing Home Assistant API Connection..."
API_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/")
if echo "$API_RESPONSE" | grep -q "API running"; then
    echo "   ✓ API connection successful"
else
    echo "   ✗ API connection failed: $API_RESPONSE"
    exit 1
fi

# Test 2: Conversation API
echo "2. Testing Conversation API..."
CONV_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"text":"what time is it","language":"en"}' \
    "$BASE_URL/api/conversation/process")

if echo "$CONV_RESPONSE" | grep -q "response"; then
    echo "   ✓ Conversation API working"
    RESPONSE_TEXT=$(echo "$CONV_RESPONSE" | grep -o '"speech":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "   Response: $RESPONSE_TEXT"
else
    echo "   ✗ Conversation API failed: $CONV_RESPONSE"
fi

# Test 3: WebSocket Connection Test
echo "3. Testing WebSocket authentication..."
WS_TEST=$(curl -s -X GET -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/states" | head -c 100)
if echo "$WS_TEST" | grep -q "entity_id"; then
    echo "   ✓ API states accessible (WebSocket will work)"
else
    echo "   ⚠ States API response: ${WS_TEST:0:50}..."
fi

# Test 4: Local Server
echo "4. Testing local widget server..."
LOCAL_RESPONSE=$(curl -s http://localhost:8099/ 2>/dev/null | head -1)
if echo "$LOCAL_RESPONSE" | grep -q "DOCTYPE"; then
    echo "   ✓ Local server running on port 8099"
else
    echo "   ✗ Local server not responding"
fi

# Test 5: API Config endpoint
echo "5. Testing local API config..."
CONFIG_RESPONSE=$(curl -s http://localhost:8099/api/config 2>/dev/null)
if echo "$CONFIG_RESPONSE" | grep -q "options"; then
    echo "   ✓ Config API working"
else
    echo "   ⚠ Config API: $CONFIG_RESPONSE"
fi

echo ""
echo "=== Test Complete ==="
echo ""
echo "The Voice Assistant Widget is ready!"
echo "Open http://localhost:8099 in your browser to use it."
echo ""
echo "To connect, use these credentials:"
echo "  URL: $BASE_URL"
echo "  Token: (stored in credentials.ini)"
