@echo off
REM Uploads all saved versions (commits and tags) of Aurora to GitHub.
cd /d "%~dp0"
git -c safe.directory=* push -u origin main --tags
echo.
if errorlevel 1 (echo Push failed - see the message above.) else (echo Done! https://github.com/UndeadBossGames/Aurora)
pause
