import ThreeSixty from './threesixty'

let d = document.getElementById('360Video')

const ts = new ThreeSixty()
ts.attach(d)

/*
const defaultLoader = () => {
  console.log('this is clicked')
}

document.getElementById('btn-default').addEventListener('click', defaultLoader)

*/
