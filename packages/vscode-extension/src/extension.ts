import * as vscode from 'vscode';
import { SemanticSearchViewProvider } from './webview/semanticSearchProvider';

import { SearchCommand } from './commands/searchCommand';
import { IndexCommand } from './commands/indexCommand';
import { ConfigManager } from './config/configManager';
import { CodeIndexer, OpenAIEmbedding, VoyageAIEmbedding, MilvusRestfulVectorDatabase } from '@code-indexer/core';

let semanticSearchProvider: SemanticSearchViewProvider;
let searchCommand: SearchCommand;
let indexCommand: IndexCommand;
let configManager: ConfigManager;
let codeIndexer: CodeIndexer;

export async function activate(context: vscode.ExtensionContext) {
    console.log('CodeIndexer extension is now active!');

    // Initialize config manager
    configManager = new ConfigManager(context);

    // Initialize shared codeIndexer instance with embedding configuration
    codeIndexer = createCodeIndexerWithConfig(configManager);

    // Initialize providers and commands
    searchCommand = new SearchCommand(codeIndexer);
    indexCommand = new IndexCommand(codeIndexer);
    semanticSearchProvider = new SemanticSearchViewProvider(context.extensionUri, searchCommand, indexCommand, configManager);

    // Register command handlers
    const disposables = [
        // Register webview providers
        vscode.window.registerWebviewViewProvider(SemanticSearchViewProvider.viewType, semanticSearchProvider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }),

        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('semanticCodeSearch.embeddingProvider') ||
                event.affectsConfiguration('semanticCodeSearch.milvus')) {
                console.log('CodeIndexer configuration changed, reloading...');
                reloadCodeIndexerConfiguration();
            }
        }),

        // Register commands
        vscode.commands.registerCommand('semanticCodeSearch.semanticSearch', () => {
            // Get selected text from active editor
            const editor = vscode.window.activeTextEditor;
            const selectedText = editor?.document.getText(editor.selection);
            return searchCommand.execute(selectedText);
        }),
        vscode.commands.registerCommand('semanticCodeSearch.indexCodebase', () => indexCommand.execute()),
        vscode.commands.registerCommand('semanticCodeSearch.clearIndex', () => indexCommand.clearIndex()),
        vscode.commands.registerCommand('semanticCodeSearch.reloadConfiguration', () => reloadCodeIndexerConfiguration())
    ];

    context.subscriptions.push(...disposables);

    // Show status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = `$(search) CodeIndexer`;
    statusBarItem.tooltip = 'Click to open semantic search';
    statusBarItem.command = 'semanticCodeSearch.semanticSearch';
    statusBarItem.show();

    context.subscriptions.push(statusBarItem);
}

function createCodeIndexerWithConfig(configManager: ConfigManager): CodeIndexer {
    const embeddingConfig = configManager.getEmbeddingProviderConfig();
    const milvusConfig = configManager.getMilvusFullConfig();

    try {
        let embedding;
        let vectorDatabase;

        const codeIndexerConfig: any = {};

        // Create embedding instance
        if (embeddingConfig) {
            embedding = ConfigManager.createEmbeddingInstance(embeddingConfig.provider, embeddingConfig.config);
            console.log(`Embedding initialized with ${embeddingConfig.provider} (model: ${embeddingConfig.config.model})`);
            codeIndexerConfig.embedding = embedding;
        } else {
            console.log('No embedding configuration found');
        }

        // Create vector database instance
        if (milvusConfig) {
            vectorDatabase = new MilvusRestfulVectorDatabase(milvusConfig);
            console.log(`Vector database initialized with Milvus REST API (address: ${milvusConfig.address})`);
            codeIndexerConfig.vectorDatabase = vectorDatabase;
        } else {
            vectorDatabase = new MilvusRestfulVectorDatabase({
                address: process.env.MILVUS_ADDRESS || 'http://localhost:19530',
                token: process.env.MILVUS_TOKEN || ''
            });
            console.log('No Milvus configuration found, using default REST API configuration');
            codeIndexerConfig.vectorDatabase = vectorDatabase;
        }
        return new CodeIndexer(codeIndexerConfig);
    } catch (error) {
        console.error('Failed to create CodeIndexer with user config:', error);
        vscode.window.showErrorMessage(`Failed to initialize CodeIndexer: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
    }
}

function reloadCodeIndexerConfiguration() {
    console.log('Reloading CodeIndexer configuration...');

    const embeddingConfig = configManager.getEmbeddingProviderConfig();
    const milvusConfig = configManager.getMilvusFullConfig();

    try {
        // Update embedding if configuration exists
        if (embeddingConfig) {
            const embedding = ConfigManager.createEmbeddingInstance(embeddingConfig.provider, embeddingConfig.config);
            codeIndexer.updateEmbedding(embedding);
            console.log(`Embedding updated with ${embeddingConfig.provider} (model: ${embeddingConfig.config.model})`);
        }

        // Update vector database if configuration exists
        if (milvusConfig) {
            const vectorDatabase = new MilvusRestfulVectorDatabase(milvusConfig);
            codeIndexer.updateVectorDatabase(vectorDatabase);
            console.log(`Vector database updated with Milvus REST API (address: ${milvusConfig.address})`);
        }

        console.log('CodeIndexer configuration reloaded successfully');
        vscode.window.showInformationMessage('Configuration reloaded successfully!');
    } catch (error) {
        console.error('Failed to reload CodeIndexer configuration:', error);
        vscode.window.showErrorMessage(`Failed to reload configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export function deactivate() {
    console.log('CodeIndexer extension is now deactivated');
} 