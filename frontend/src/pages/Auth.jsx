import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { authApi } from '../services/api'

const AUTH_MODES = ['login', 'register', 'forgot', 'reset-password', 'verify-email']

function Auth() {
    const [searchParams, setSearchParams] = useSearchParams()
    const initialMode = searchParams.get('mode')
    const [mode, setMode] = useState(AUTH_MODES.includes(initialMode) ? initialMode : 'login')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [account, setAccount] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()
    const location = useLocation()
    const token = searchParams.get('token') || ''
    const verificationStarted = useRef(false)

    const changeMode = (nextMode) => {
        setMode(nextMode)
        setError('')
        setMessage('')
        setPassword('')
        setNewPassword('')
        setConfirmPassword('')
        const params = nextMode === 'login' ? {} : { mode: nextMode }
        setSearchParams(params, { replace: true })
    }

    useEffect(() => {
        if (mode !== 'verify-email' || !token) return
        if (verificationStarted.current) return
        verificationStarted.current = true

        const verifyEmail = async () => {
            setLoading(true)
            try {
                const data = await authApi.verifyRecoveryEmail(token)
                setMessage(data.message)
            } catch (err) {
                setError(err.response?.data?.detail || '驗證連結無效或已過期')
            } finally {
                setLoading(false)
            }
        }
        verifyEmail()
    }, [mode, token])

    const handleSubmit = async (event) => {
        event.preventDefault()
        setError('')
        setMessage('')
        setLoading(true)

        try {
            if (mode === 'forgot') {
                const data = await authApi.forgotPassword(account)
                setMessage(data.message)
                return
            }

            if (mode === 'reset-password') {
                if (!token) throw new Error('缺少重設密碼連結')
                if (newPassword !== confirmPassword) {
                    setError('兩次輸入的密碼不一致')
                    return
                }
                const data = await authApi.resetPassword(token, newPassword)
                setMessage(data.message)
                setTimeout(() => changeMode('login'), 1200)
                return
            }

            if (mode === 'login') {
                await authApi.login(username, password)
            } else {
                await authApi.register(username, password)
                await authApi.login(username, password)
            }

            const from = location.state?.from
            const destination = from ? `${from.pathname}${from.search || ''}` : '/'
            navigate(destination, { replace: true })
        } catch (err) {
            console.error(err)
            setError(err.response?.data?.detail || err.message || '驗證失敗，請重試。')
        } finally {
            setLoading(false)
        }
    }

    const isPrimaryAuth = mode === 'login' || mode === 'register'

    return (
        <div className={`auth-page auth-page--${mode}`}>
            <button className="auth-home-link" onClick={() => navigate('/')}>← 返回首頁</button>

            <motion.section
                className="auth-container"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <div className="auth-brand">
                    <div className="auth-brand-icon">▶</div>
                    <span>YT Alt</span>
                </div>

                {isPrimaryAuth && (
                    <div className="auth-tabs" role="tablist" aria-label="帳戶功能">
                        <button
                            type="button"
                            className={mode === 'login' ? 'active' : ''}
                            onClick={() => changeMode('login')}
                        >
                            登入
                        </button>
                        <button
                            type="button"
                            className={mode === 'register' ? 'active' : ''}
                            onClick={() => changeMode('register')}
                        >
                            建立帳戶
                        </button>
                    </div>
                )}

                <AnimatePresence mode="wait">
                    <motion.div
                        key={mode}
                        initial={{ opacity: 0, x: mode === 'register' ? 18 : -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.2 }}
                    >
                        <h1>{getTitle(mode)}</h1>
                        <p className="auth-subtitle">{getSubtitle(mode)}</p>

                        {error && <div className="auth-alert auth-alert--error">{error}</div>}
                        {message && <div className="auth-alert auth-alert--success">{message}</div>}

                        {mode === 'verify-email' ? (
                            <div className="auth-verification">
                                {loading && <span className="auth-spinner" />}
                                <button type="button" className="auth-button" onClick={() => changeMode('login')}>
                                    返回登入
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                {isPrimaryAuth && (
                                    <div className="auth-form-group">
                                        <label htmlFor="auth-username">使用者名稱</label>
                                        <input
                                            id="auth-username"
                                            type="text"
                                            value={username}
                                            onChange={(event) => setUsername(event.target.value)}
                                            required
                                            minLength={3}
                                            maxLength={50}
                                            autoComplete="username"
                                            placeholder="請輸入使用者名稱"
                                        />
                                    </div>
                                )}

                                {isPrimaryAuth && (
                                    <div className="auth-form-group">
                                        <div className="auth-label-row">
                                            <label htmlFor="auth-password">密碼</label>
                                            {mode === 'login' && (
                                                <button type="button" onClick={() => changeMode('forgot')}>忘記密碼？</button>
                                            )}
                                        </div>
                                        <input
                                            id="auth-password"
                                            type="password"
                                            value={password}
                                            onChange={(event) => setPassword(event.target.value)}
                                            required
                                            minLength={6}
                                            maxLength={128}
                                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                            placeholder={mode === 'login' ? '請輸入密碼' : '至少 6 個字元'}
                                        />
                                    </div>
                                )}

                                {mode === 'forgot' && (
                                    <div className="auth-form-group">
                                        <label htmlFor="auth-account">使用者名稱或恢復信箱</label>
                                        <input
                                            id="auth-account"
                                            type="text"
                                            value={account}
                                            onChange={(event) => setAccount(event.target.value)}
                                            required
                                            autoComplete="username"
                                            placeholder="輸入帳號或 Email"
                                        />
                                    </div>
                                )}

                                {mode === 'reset-password' && (
                                    <>
                                        <div className="auth-form-group">
                                            <label htmlFor="auth-new-password">新密碼</label>
                                            <input
                                                id="auth-new-password"
                                                type="password"
                                                value={newPassword}
                                                onChange={(event) => setNewPassword(event.target.value)}
                                                required
                                                minLength={6}
                                                maxLength={128}
                                                autoComplete="new-password"
                                                placeholder="至少 6 個字元"
                                            />
                                        </div>
                                        <div className="auth-form-group">
                                            <label htmlFor="auth-confirm-password">再次輸入新密碼</label>
                                            <input
                                                id="auth-confirm-password"
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(event) => setConfirmPassword(event.target.value)}
                                                required
                                                minLength={6}
                                                maxLength={128}
                                                autoComplete="new-password"
                                                placeholder="再次輸入新密碼"
                                            />
                                        </div>
                                    </>
                                )}

                                <button type="submit" className="auth-button" disabled={loading}>
                                    {loading ? '處理中…' : getSubmitLabel(mode)}
                                </button>
                            </form>
                        )}

                        {!isPrimaryAuth && mode !== 'verify-email' && (
                            <button type="button" className="auth-back-button" onClick={() => changeMode('login')}>
                                ← 返回登入
                            </button>
                        )}
                    </motion.div>
                </AnimatePresence>
            </motion.section>

            <style>{authStyles}</style>
        </div>
    )
}

function getTitle(mode) {
    if (mode === 'register') return '建立你的帳戶'
    if (mode === 'forgot') return '找回密碼'
    if (mode === 'reset-password') return '設定新密碼'
    if (mode === 'verify-email') return '驗證恢復信箱'
    return '歡迎回來'
}

function getSubtitle(mode) {
    if (mode === 'register') return '註冊後會自動登入，立即建立你的播放空間。'
    if (mode === 'forgot') return '若帳戶已設定恢復信箱，我們會寄出重設連結。'
    if (mode === 'reset-password') return '請設定一組新的登入密碼。'
    if (mode === 'verify-email') return '正在確認這個恢復信箱是否屬於你。'
    return '登入後繼續查看訂閱、紀錄與播放清單。'
}

function getSubmitLabel(mode) {
    if (mode === 'register') return '建立帳戶並登入'
    if (mode === 'forgot') return '寄送重設連結'
    if (mode === 'reset-password') return '重設密碼'
    return '登入'
}

const authStyles = `
    .auth-page {
        min-height: 100dvh;
        display: grid;
        place-items: center;
        position: relative;
        overflow: hidden;
        padding: 72px 20px 32px;
        background:
            radial-gradient(circle at 15% 15%, rgba(255, 0, 0, 0.2), transparent 35%),
            radial-gradient(circle at 85% 85%, rgba(78, 90, 255, 0.16), transparent 36%),
            var(--bg-primary);
    }

    .auth-page--register {
        background:
            radial-gradient(circle at 82% 18%, rgba(255, 0, 0, 0.24), transparent 38%),
            radial-gradient(circle at 10% 86%, rgba(255, 122, 0, 0.12), transparent 34%),
            var(--bg-primary);
    }

    .auth-page::before {
        content: '';
        position: absolute;
        inset: 0;
        opacity: 0.18;
        background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
        background-size: 44px 44px;
        pointer-events: none;
    }

    .auth-home-link {
        position: absolute;
        top: 24px;
        left: 24px;
        z-index: 2;
        color: var(--text-secondary);
        padding: 8px 12px;
        border-radius: 999px;
    }

    .auth-home-link:hover { background: rgba(255,255,255,.08); color: white; }

    .auth-container {
        position: relative;
        z-index: 1;
        width: min(100%, 440px);
        padding: 32px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 24px;
        background: rgba(26,26,26,.9);
        box-shadow: 0 24px 80px rgba(0,0,0,.5);
        backdrop-filter: blur(18px);
    }

    .auth-brand { display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 800; margin-bottom: 24px; }
    .auth-brand-icon { width: 34px; height: 24px; display: grid; place-items: center; padding-left: 2px; border-radius: 8px; background: var(--accent); font-size: 12px; }

    .auth-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; margin-bottom: 26px; border-radius: 14px; background: rgba(0,0,0,.28); }
    .auth-tabs button { padding: 11px 10px; border-radius: 11px; color: var(--text-secondary); font-weight: 700; transition: .2s ease; }
    .auth-tabs button.active { color: white; background: var(--accent); box-shadow: 0 6px 18px rgba(255,0,0,.24); }

    .auth-container h1 { margin: 0 0 8px; text-align: center; font-size: clamp(1.75rem, 7vw, 2.15rem); line-height: 1.2; }
    .auth-subtitle { min-height: 48px; margin: 0 0 22px; text-align: center; color: var(--text-secondary); font-size: 14px; }
    .auth-form-group { margin-bottom: 18px; }
    .auth-form-group label { display: block; margin-bottom: 8px; color: var(--text-secondary); font-size: 14px; font-weight: 600; }
    .auth-label-row { display: flex; align-items: center; justify-content: space-between; }
    .auth-label-row button { color: #ff6b6b; font-size: 13px !important; }

    .auth-form-group input {
        width: 100%;
        padding: 13px 14px;
        border: 1px solid rgba(255,255,255,.13);
        border-radius: 12px;
        outline: none;
        background: rgba(0,0,0,.24);
        color: white;
        transition: border-color .2s, box-shadow .2s;
    }
    .auth-form-group input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(255,0,0,.14); }

    .auth-button { width: 100%; padding: 14px; margin-top: 6px; border-radius: 12px; background: var(--accent); color: white; font-weight: 800; box-shadow: 0 10px 26px rgba(255,0,0,.22); }
    .auth-button:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-1px); }
    .auth-button:disabled { opacity: .65; cursor: not-allowed; }
    .auth-back-button { display: block; margin: 20px auto 0; color: var(--text-secondary); }

    .auth-alert { padding: 12px 14px; margin-bottom: 18px; border-radius: 10px; font-size: 14px; text-align: center; }
    .auth-alert--error { color: #ff8b8b; background: rgba(255,0,0,.12); border: 1px solid rgba(255,0,0,.24); }
    .auth-alert--success { color: #83e6ad; background: rgba(22,163,74,.12); border: 1px solid rgba(22,163,74,.24); }
    .auth-verification { display: grid; gap: 18px; justify-items: center; }
    .auth-spinner { width: 30px; height: 30px; border: 3px solid rgba(255,255,255,.18); border-top-color: var(--accent); border-radius: 50%; animation: auth-spin .8s linear infinite; }
    @keyframes auth-spin { to { transform: rotate(360deg); } }

    @media (max-width: 600px) {
        .auth-page { align-items: start; padding: 68px 14px 24px; }
        .auth-home-link { top: 14px; left: 10px; }
        .auth-container { padding: 24px 20px; border-radius: 20px; }
    }
`

export default Auth
