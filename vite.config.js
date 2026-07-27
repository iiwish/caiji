import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  build: {
    chunkSizeWarningLimit: 550,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)) return 'react-vendor'
          if (/node_modules[\\/]antd[\\/]es[\\/]table[\\/]/.test(id)) return 'antd-table'
          if (/node_modules[\\/]antd[\\/]/.test(id)) return 'antd-vendor'
          if (/node_modules[\\/]@ant-design[\\/]icons/.test(id)) return 'antd-icons'
          if (/node_modules[\\/]@ant-design[\\/]/.test(id)) return 'antd-style-runtime'
          if (/node_modules[\\/]@rc-component[\\/]/.test(id)) return 'rc-components'
          if (/node_modules[\\/](rc-table|rc-pagination|rc-virtual-list)[\\/]/.test(id)) return 'rc-table-runtime'
          if (/node_modules[\\/]rc-/.test(id)) return 'rc-runtime'
          return 'vendor'
        },
      },
    },
  },
})
