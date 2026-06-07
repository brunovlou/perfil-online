import Game from './pages/Game'
import LeitorView from './pages/LeitorView'

export default function App() {
  const isLeitor = new URLSearchParams(window.location.search).has('leitor')
  return isLeitor ? <LeitorView /> : <Game />
}
