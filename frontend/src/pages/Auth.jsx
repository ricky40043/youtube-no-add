import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { motion } from 'framer-motion'

function Auth() {
    const [isLogin, setIsLogin] = useState(true)
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            if (isLogin) {
                await authApi.login(username, password)
            } else {
                await authApi.register(username, password)
                // Auto login after register
                await authApi.login(username, password)
            }
            // Navigate home or previous page
            navigate('/')
        } catch (err) {
            console.error(err)
            setError(err.response?.data?.detail || '驗證失敗，請重試。')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="auth-page">
            <motion.div
                className="auth-container"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <h1>{isLogin ? '歡迎回來' : '建立帳戶'}</h1>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>使用者名稱</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            placeholder="請輸入使用者名稱"
                        />
                    </div>

                    <div className="form-group">
                        <label>密碼</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="請輸入密碼"
                        />
                    </div>

                    <button type="submit" className="auth-button" disabled={loading}>
                        {loading ? '處理中...' : (isLogin ? '登入' : '註冊')}
                    </button>
                </form>

                <div className="auth-switch">
                    {isLogin ? "還沒有帳戶？ " : "已經有帳戶？ "}
                    <button onClick={() => setIsLogin(!isLogin)} className="switch-button">
                        {isLogin ? '註冊' : '登入'}
                    </button>
                </div>
            </motion.div>

            <style>{`
                .auth-page {
                    min-height: calc(100vh - 60px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--bg-primary);
                    padding: 20px;
                }
                
                .auth-container {
                    background: var(--bg-secondary);
                    padding: 30px;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 400px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                }
                
                h1 {
                    text-align: center;
                    margin-bottom: 24px;
                    color: var(--text-primary);
                }
                
                .form-group {
                    margin-bottom: 20px;
                }
                
                label {
                    display: block;
                    margin-bottom: 8px;
                    color: var(--text-secondary);
                    font-size: 14px;
                }
                
                input {
                    width: 100%;
                    padding: 12px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.1);
                    background: rgba(0,0,0,0.2);
                    color: white;
                    font-size: 16px;
                }
                
                input:focus {
                    border-color: var(--accent-color);
                    outline: none;
                }
                
                .auth-button {
                    width: 100%;
                    padding: 14px;
                    background: var(--accent-color);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                    margin-top: 10px;
                }
                
                .auth-button:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }
                
                .error-message {
                    background: rgba(255, 0, 0, 0.1);
                    color: #ff4444;
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    font-size: 14px;
                    text-align: center;
                }
                
                .auth-switch {
                    text-align: center;
                    margin-top: 20px;
                    color: var(--text-secondary);
                    font-size: 14px;
                }
                
                .switch-button {
                    background: none;
                    border: none;
                    color: var(--accent-color);
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 14px;
                    padding: 0;
                    margin-left: 4px;
                }
            `}</style>
        </div>
    )
}

export default Auth
