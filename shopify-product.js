const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");

const app = express();
const port = 3000;

const shopName = "rutterinterview.myshopify.com";
const accessToken = "shpua_b1c9a97a8a3a33ee4a1aa0600b160cab";

async function connectToMongoDB() {
  // Connect to your MongoDB database
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/shopify", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Fetch and persist products and orders when the server starts
    fetchAndPersistProducts();
    fetchAndPersistOrders();

    // Start the server
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });

    console.log("Connected to MongoDB");
  } catch (error) {
    console.error(error);
  }
}

connectToMongoDB();

// Define the Product schema
const productSchema = new mongoose.Schema({
  platform_id: String,
  name: String,
});

const Product = mongoose.model("Product", productSchema);

// Define the Order schema
const orderSchema = new mongoose.Schema({
  platform_id: String,
  line_items: [
    {
      product_id: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    },
  ],
});

const Order = mongoose.model("Order", orderSchema);

// Fetch and persist all products from Shopify
async function fetchAndPersistProducts() {
  try {
    const query = `
      query {
        products(first: 100) {
          edges {
            node {
              id
              title
            }
          }
        }
      }
    `;

    const response = await axios.post(
      `https://${shopName}/admin/api/2022-04/graphql.json`,
      query,
      {
        headers: {
          "Content-Type": "application/graphql",
          "X-Shopify-Access-Token": `${accessToken}`,
        },
      }
    );

    const products = response.data.data.products.edges.map((edge) => ({
      platform_id: edge.node.id,
      name: edge.node.title,
    }));

    await Product.insertMany(products);
    console.log("Products fetched and persisted successfully!");
  } catch (error) {
    console.error("Error fetching and persisting products:", error);
  }
}

// Fetch and persist the first 500 orders from Shopify
async function fetchAndPersistOrders() {
  try {
    const query = `
    query {
      orders(first: 5) {
        edges {
          node {
            id
            lineItems(first: 5) {
              edges {
                node {
                  id
                  title
                  quantity
                  variant {
                    id
                    title
                    price
                  }
                  product {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
    `;

    const response = await axios.post(
      `https://${shopName}/admin/api/2022-04/graphql.json`,
      query,
      {
        headers: {
          "Content-Type": "application/graphql",
          "X-Shopify-Access-Token": `${accessToken}`,
        },
      }
    );

    const orders = response.data.data.orders.edges.map((edge) => ({
      platform_id: edge.node.id,
      name: edge.node.lineItems.edges.map((lineItem) => ({
        product_id: lineItem.node.product ? lineItem.node.product.id : null,
      })),
    }));

    await Order.insertMany(orders);
    console.log("Orders fetched and persisted successfully!");
  } catch (error) {
    console.error("Error fetching and persisting orders:", error);
  }
}

// Get all products from the database
async function getProducts() {
  try {
    const products = await Product.find();
    return products.map((product) => ({
      id: product._id.toString(),
      platform_id: product.platform_id,
      name: product.name,
    }));
  } catch (error) {
    console.error("Error getting products:", error);
    return [];
  }
}

// Get all orders from the database
async function getOrders() {
  try {
    const orders = await Order.find({
      "line_items.product_id": { $ne: null },
    }).populate("line_items.product_id");
    return orders.map((order) => ({
      id: order._id.toString(),
      platform_id: order.platform_id,
      line_items: order.line_items.map((lineItem) => ({
        product_id: lineItem.product_id
          ? lineItem.product_id._id.toString()
          : null,
      })),
    }));
  } catch (error) {
    console.error("Error getting orders:", error);
    return [];
  }
}

// Define API endpoints
app.get("/products", async (req, res) => {
  const products = await getProducts();
  res.json(products);
});

app.get("/orders", async (req, res) => {
  const orders = await getOrders();
  res.json(orders);
});
