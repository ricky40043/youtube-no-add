import { motion, AnimatePresence } from 'framer-motion'

function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = '確定', cancelText = '取消' }) {
    if (!isOpen) return null

    return (
        <AnimatePresence>
            <div className="modal-overlay" onClick={onClose}>
                <motion.div
                    className="modal-content"
                    onClick={(e) => e.stopPropagation()}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                >
                    <h3 className="modal-title">{title}</h3>
                    <p className="modal-message">{message}</p>

                    <div className="modal-actions">
                        <button className="btn-cancel" onClick={onClose}>
                            {cancelText}
                        </button>
                        <button className="btn-confirm" onClick={() => {
                            onConfirm()
                            onClose()
                        }}>
                            {confirmText}
                        </button>
                    </div>
                </motion.div>

                <style>{`
                    .modal-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.7);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 1000;
                        backdrop-filter: blur(4px);
                    }
                    .modal-content {
                        background: #1e1e1e;
                        border: 1px solid #333;
                        border-radius: 12px;
                        padding: 24px;
                        width: 90%;
                        max-width: 400px;
                        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
                    }
                    .modal-title {
                        margin: 0 0 12px 0;
                        font-size: 1.2rem;
                        color: #fff;
                    }
                    .modal-message {
                        color: #aaa;
                        margin-bottom: 24px;
                        line-height: 1.5;
                    }
                    .modal-actions {
                        display: flex;
                        justify-content: flex-end;
                        gap: 12px;
                    }
                    .btn-cancel {
                        padding: 8px 16px;
                        border-radius: 20px;
                        border: none;
                        background: transparent;
                        color: #aaa;
                        cursor: pointer;
                        font-size: 0.9rem;
                    }
                    .btn-cancel:hover {
                        color: #fff;
                        background: rgba(255, 255, 255, 0.1);
                    }
                    .btn-confirm {
                        padding: 8px 20px;
                        border-radius: 20px;
                        border: none;
                        background: #cc0000;
                        color: white;
                        font-weight: bold;
                        cursor: pointer;
                        font-size: 0.9rem;
                    }
                    .btn-confirm:hover {
                        background: #ff0000;
                    }
                `}</style>
            </div>
        </AnimatePresence>
    )
}

export default ConfirmModal
