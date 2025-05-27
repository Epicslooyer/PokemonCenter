const { MongoClient } = require('mongodb');

const uri = process.env.DB_LINK;
const dbName = 'stock-checker';
const collectionName = 'stock-states';
let client;
let db_instance;

async function connectToDB() {
    if (db_instance && client && client.topology && client.topology.isConnected()) {
        return db_instance;
    }
    if (!uri) {
        console.error('No database link (DB_LINK) provided in environment variables.');
        throw new Error('No database link (DB_LINK) provided. Please set it in your .env file.');
    }

    try {
        client = new MongoClient(uri);
        await client.connect();
        db_instance = client.db(dbName);
        console.log('Successfully connected to MongoDB.');
        return db_instance;
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        db_instance = null; 
        client = null; 
        throw error; 
    }
}

async function loadProducts(productStatesToUpdate) {
    if (!db_instance) {
        await connectToDB(); 
        if (!db_instance) {
            console.error('Failed to connect to DB before loading products.');
            throw new Error('Database not connected after attempting to connect for loading.');
        }
    }

    try {
        const collection_instance = db_instance.collection(collectionName);
        const statesFromDB = await collection_instance.find({}).toArray();

        for (const key in productStatesToUpdate) {
            delete productStatesToUpdate[key];
        }
        
        statesFromDB.forEach(dbDoc => {
            if (dbDoc.mpn) { 
                productStatesToUpdate[dbDoc.mpn] = {
                    name: dbDoc.name,
                    inStock: dbDoc.inStock,
                    url: dbDoc.url,
                    lastSeenOn: dbDoc.lastSeenOn,
                    lastChecked: dbDoc.lastChecked 
                };
            }
        });
        console.log(`Loaded ${Object.keys(productStatesToUpdate).length} products into productStates cache.`);
    } catch (error) {
        console.error('Error loading products from MongoDB:', error);
    }
}

async function saveProductStates(productStatesToSave) {
    if (!db_instance) {
        await connectToDB(); // Ensure connection
         if (!db_instance) {
            console.error('Failed to connect to DB before saving products. States not saved.');
            return; 
        }
    }
    
    try {
        const collection_instance = db_instance.collection(collectionName);
        const opts = Object.keys(productStatesToSave).map(mpn => {
            const product = productStatesToSave[mpn];
            if (!product || typeof product.name === 'undefined') { // Basic validation
                console.warn(`Skipping save for invalid product data with MPN: ${mpn}`);
                return null;
            }
            const updatePayload = {
                name: product.name,
                inStock: typeof product.inStock === 'boolean' ? product.inStock : false,
                url: product.url,
                lastSeenOn: product.lastSeenOn,
                lastChecked: new Date()
            };
            return {
                updateOne: {
                    filter: { mpn: mpn },
                    update: { $set: updatePayload },
                    upsert: true
                }
            };
        }).filter(opt => opt !== null); 

        if (opts.length > 0) {
            await collection_instance.bulkWrite(opts);
            console.log(`Saved/Updated ${opts.length} product states to MongoDB.`);
        } else {
            console.log('No valid product states to save to MongoDB.');
        }
    } catch(error) {
        console.error('Error saving product states to MongoDB:', error);
    }
}

module.exports = { connectToDB, loadProducts, saveProductStates };