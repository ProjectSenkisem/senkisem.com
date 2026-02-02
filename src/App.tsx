import NavBar from "./components/NavBar";
import Hero from "./components/Hero";
import About from "./components/About";
import Features from "./components/Features";
import Story from "./components/Story";
import Footer from "./components/Footer";

const App = () => {
  return (
    <main className="relative min-h-screen w-screen overflow-x-hidden max-w-full">
      <NavBar/>
      <Hero />
      <About />
      <Features/>
      <Story/>
      <Footer/>
    </main>
  );
};

export default App;