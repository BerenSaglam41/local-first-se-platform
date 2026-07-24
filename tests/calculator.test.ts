import { Calculator } from '../src/calculator';

describe('Calculator', () => {
  let calculator: Calculator;

  beforeEach(() => {
    calculator = new Calculator();
  });

  it('should add numbers correctly', () => {
    expect(calculator.add(10, 5)).toBe(15);
  });

  it('should subtract numbers correctly', () => {
    expect(calculator.subtract(10, 5)).toBe(5);
  });

  it('should multiply numbers correctly', () => {
    expect(calculator.multiply(10, 5)).toBe(50);
  });

  it('should divide numbers correctly', () => {
    expect(calculator.divide(10, 5)).toBe(2);
  });

  it('should throw error when dividing by zero', () => {
    expect(() => calculator.divide(10, 0)).toThrow('Division by zero');
  });
});
