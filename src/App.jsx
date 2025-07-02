import './App.css'
import AABMDisplay from "./components/AABMDisplay/index";

function App() {

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-blue-500">
        <h1 className="text-4xl font-bold text-white">
          <AABMDisplay></AABMDisplay>
        </h1>
      </div>
    </>
  )
}

export default App
