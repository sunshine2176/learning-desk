#!/bin/bash
# 双击启动学习台
cd "$(dirname "$0")" || exit 1
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")
echo ""
echo "  学习台启动中…  平板请访问： http://$IP:8777"
echo ""
python3 server.py
