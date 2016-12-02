const ThreeSixty = () => {
  let div

  const attach = (element) => {
    if (element.tagName) {
      div = element
    }
    else
      console.log(`${div} is not an HTML div container`)
  }

  const pitch = (num) => {

  }

  const roll = (num) => {

  }

  const yaw = (num) => {

  }

  return {
    attach,
    pitch,
    roll,
    yaw
  }
}

module.exports = ThreeSixty
