require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Snoowrap = require('snoowrap');
const { Client, GatewayIntentBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

// Setup express server
const app = express();
app.use(cors());
app.use(express.json());

// Create or open the SQLite database
const db = new sqlite3.Database('./posts.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        // Create table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS posted_posts (
            id TEXT PRIMARY KEY
        )`, (err) => {
            if (err) {
                console.error('Error creating table:', err.message);
            }
        });
    }
});

// Reddit API configuration
const reddit = new Snoowrap({
    userAgent: 'myBot',
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD,
});

// Discord bot setup
const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Function to check if a post ID has been posted
function hasPostBeenPosted(postId, callback) {
    db.get('SELECT id FROM posted_posts WHERE id = ?', [postId], (err, row) => {
        if (err) {
            console.error('Error querying database:', err.message);
            return callback(false);
        }
        callback(row !== undefined); // If row is found, the post has been posted
    });
}

// Function to add a post ID to the database
function markPostAsPosted(postId) {
    db.run('INSERT INTO posted_posts (id) VALUES (?)', [postId], (err) => {
        if (err) {
            console.error('Error inserting post ID into database:', err.message);
        }
    });
}

// Function to post to Discord channel
async function postToDiscord(post) {
    try {
        const channel = await discordClient.channels.fetch(process.env.DISCORD_CHANNEL_ID);
        
        // Prepare the message with the title and image
        const message = `**${post.title}**\n${post.url}`;
        
        // Send the message with an embed if there's an image
        const embed = {
            title: post.title,
            url: post.url,
            image: {
                url: post.imageUrl,
            },
            footer: {
                text: 'Posted on Reddit',
            },
        };

        await channel.send({ content: message, embeds: [embed] });
    } catch (error) {
        console.error('Error posting to Discord:', error.message);
    }
}

// Function to fetch new posts from Reddit and send one post at a time
async function checkForNewRedditPosts() {
    try {
        const subreddit = 'IndianDankMemes'; // Specify your subreddit here

        const posts = await reddit.getSubreddit(subreddit).getNew({ limit: 5 });

        // If no posts available, do nothing
        if (posts.length === 0) return;

        // Find the first post that hasn't been sent yet
        for (const post of posts) {
            hasPostBeenPosted(post.id, async (posted) => {
                if (!posted) {
                    console.log(`Posting 1 new post to Discord: ${post.title}`);
                    
                    const imageUrl = post.preview ? post.preview.images[0].source.url : null;

                    const postToSend = {
                        title: post.title,
                        url: `https://reddit.com${post.permalink}`,
                        imageUrl: imageUrl,
                    };

                    await postToDiscord(postToSend);

                    // Mark this post as posted
                    markPostAsPosted(post.id);
                }
            });
            break; // Exit after sending one post
        }
    } catch (error) {
        console.error('Error checking for new posts:', error.message);
    }
}

// Poll Reddit every 60 seconds to check for new posts
setInterval(checkForNewRedditPosts, 60000); // 60 seconds

// Basic API route for manual fetch
app.get('/fetch-posts', async (req, res) => {
    const subreddit = 'IndianDankMemes';

    try {
        const posts = await reddit.getSubreddit(subreddit).getNew({ limit: 5 });
        const formattedPosts = posts.map(post => ({
            title: post.title,
            url: `https://reddit.com${post.permalink}`,
            imageUrl: post.preview ? post.preview.images[0].source.url : null,
        }));

        res.json(formattedPosts);
    } catch (error) {
        console.error('Error fetching posts:', error.message);
        res.status(500).json({ error: 'Failed to fetch posts', errorDetails: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    discordClient.login(process.env.DISCORD_TOKEN) // Log into Discord
        .then(() => console.log('Discord bot logged in!'))
        .catch(err => console.error('Error logging into Discord:', err.message));
});
