@echo off
setlocal
set "BETA_SUPERTONIC_ROOT=F:\StoryMaker_beta\Supertonic3"
set "HF_HOME=%BETA_SUPERTONIC_ROOT%\model_cache"
set "HUGGINGFACE_HUB_CACHE=%BETA_SUPERTONIC_ROOT%\model_cache\hub"
set "TRANSFORMERS_CACHE=%BETA_SUPERTONIC_ROOT%\model_cache\hub"
"%BETA_SUPERTONIC_ROOT%\.venv\Scripts\supertonic.exe" serve --host 127.0.0.1 --port 7790 --model supertonic-3 --cors http://127.0.0.1:8021 --log-level info
