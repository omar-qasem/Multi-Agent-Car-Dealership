@echo off
echo ====================================
echo    أوتو جوردن - تثبيت وتشغيل
echo    Auto Jordan - Install and Run
echo ====================================
echo.

echo [1/3] تثبيت الباكجات الجديدة...
call npm install

if %errorlevel% neq 0 (
    echo.
    echo [خطأ] فشل تثبيت الباكجات! تأكد من اتصال الإنترنت
    pause
    exit /b 1
)

echo.
echo [2/3] تم التثبيت بنجاح!
echo.
echo [3/3] تشغيل السيرفر...
echo.
echo السيرفر شتغل على: http://localhost:3000
echo.
call npm run dev
