import React from 'react'
import ReactDOM from 'react-dom/client'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#4b56d6',
          colorSuccess: '#0f9f61',
          colorWarning: '#b97812',
          colorError: '#d63d58',
          colorText: '#1a2233',
          colorTextSecondary: '#6b7688',
          colorBgLayout: '#f5f6f8',
          borderRadius: 9,
          fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
          controlHeight: 38,
        },
        components: {
          Card: { borderRadiusLG: 14 },
          Table: { headerBg: '#fafbfc', headerColor: '#8592a6' },
          Menu: { darkItemBg: '#101728', darkSubMenuItemBg: '#101728' },
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
)
