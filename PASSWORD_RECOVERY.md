# 密碼管理與共用寄信

密碼協助入口：https://youtube.ricky-nova.com/auth?mode=forgot

提供忘記密碼、30分鐘一次性重設連結、驗證目前密碼後修改密碼。成功重設或修改後，既有登入及其他重設連結會失效（Google 本身管理的登入另依 Google 規則）。

## 部署設定

1. 在 https://admin-home.ricky-nova.com/mail 建立此程式的獨立寄信金鑰，重設頁網址設為上方密碼協助入口（YouTube 則使用原有 /auth 頁面）。
2. 複製 `.recovery-mail.env.example` 為 `.recovery-mail.env`，填入金鑰並將檔案權限設為600；不要提交密鑰。
3. 共用寄信服務需先建立 `ricky-shared-mail` Docker 網路。
4. `docker compose up -d --build` 會自動合併 `docker-compose.override.yml`，讓後端加入該網路並載入寄信環境變數。

請保留 `.recovery-mail.env` 與原有資料持久卷。新資料表會自動建立，不會更改現有使用者的密碼。重設 token 由 URL fragment 傳遞，重設頁收到後會移除網址中的 token。

忘記密碼回應不揭露帳號是否存在。密碼只保存雜湊，不提供原密碼寄回或未驗證身分即改密碼的功能。未綁定信箱者需要先完成信箱綁定與驗證；Paw-Diary 與 YouTube 提供此流程。其他純 Google/LINE 外部登入帳號依外部服務的帳號復原機制處理。

使用者操作限流由程式與共用寄信服務共同處理。真正的信箱投遞結果需查看共用寄信後台與收件匣。

安全流程參考：[OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)。
