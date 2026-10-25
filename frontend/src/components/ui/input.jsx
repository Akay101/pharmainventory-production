import * as React from "react"
import WaveInput from "./WaveInput"

const Input = React.forwardRef((props, ref) => {
  return <WaveInput ref={ref} {...props} />;
});
Input.displayName = "Input";

export { Input };
export default Input;
