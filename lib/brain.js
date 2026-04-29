// Pure JavaScript Neural Network - No Dependencies
class NeuralNetwork {
  constructor(inputSize, hiddenSize, outputSize) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;
    
    // Initialize random weights
    this.weights1 = this.randomMatrix(hiddenSize, inputSize);
    this.weights2 = this.randomMatrix(outputSize, hiddenSize);
    this.bias1 = new Array(hiddenSize).fill(0).map(() => Math.random() * 0.1);
    this.bias2 = new Array(outputSize).fill(0).map(() => Math.random() * 0.1);
  }

  randomMatrix(rows, cols) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() * 2 - 1) * 0.1)
    );
  }

  // Sigmoid activation
  sigmoid(x) {
    if (Array.isArray(x)) return x.map(v => this.sigmoid(v));
    return 1.0 / (1.0 + Math.exp(-x));
  }

  sigmoidDerivative(x) {
    if (Array.isArray(x)) return x.map(v => this.sigmoidDerivative(v));
    const sx = this.sigmoid(x);
    return sx * (1 - sx);
  }

  // Forward pass
  forward(input) {
    this.input = input;
    
    // Hidden layer
    this.hiddenRaw = this.weights1.map(row =>
      row.reduce((sum, w, i) => sum + w * input[i], 0)
    ).map((v, i) => v + this.bias1[i]);
    this.hidden = this.sigmoid(this.hiddenRaw);
    
    // Output layer
    this.outputRaw = this.weights2.map(row =>
      row.reduce((sum, w, i) => sum + w * this.hidden[i], 0)
    ).map((v, i) => v + this.bias2[i]);
    this.output = this.sigmoid(this.outputRaw);
    
    return this.output;
  }

  // Backward pass (training)
  backward(target, learningRate = 0.1) {
    // Output error
    const outputErrors = this.output.map((o, i) => target[i] - o);
    const outputDeltas = outputErrors.map((e, i) => e * this.sigmoidDerivative(this.outputRaw[i]));
    
    // Hidden error
    const hiddenErrors = this.weights2[0].map((_, i) =>
      outputDeltas.reduce((sum, delta, j) => sum + delta * this.weights2[j][i], 0)
    );
    const hiddenDeltas = hiddenErrors.map((e, i) => e * this.sigmoidDerivative(this.hiddenRaw[i]));
    
    // Update weights2
    for (let j = 0; j < this.outputSize; j++) {
      for (let i = 0; i < this.hiddenSize; i++) {
        this.weights2[j][i] += learningRate * outputDeltas[j] * this.hidden[i];
      }
      this.bias2[j] += learningRate * outputDeltas[j];
    }
    
    // Update weights1
    for (let j = 0; j < this.hiddenSize; j++) {
      for (let i = 0; i < this.inputSize; i++) {
        this.weights1[j][i] += learningRate * hiddenDeltas[j] * this.input[i];
      }
      this.bias1[j] += learningRate * hiddenDeltas[j];
    }
    
    // Return error
    return outputErrors.reduce((sum, e) => sum + Math.abs(e), 0) / this.outputSize;
  }

  // Save to JSON
  toJSON() {
    return {
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
      outputSize: this.outputSize,
      weights1: this.weights1,
      weights2: this.weights2,
      bias1: this.bias1,
      bias2: this.bias2
    };
  }

  // Load from JSON
  static fromJSON(data) {
    const nn = new NeuralNetwork(data.inputSize, data.hiddenSize, data.outputSize);
    nn.weights1 = data.weights1;
    nn.weights2 = data.weights2;
    nn.bias1 = data.bias1;
    nn.bias2 = data.bias2;
    return nn;
  }
}

module.exports = { NeuralNetwork };
