import { App,Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
const pipeline_name="here is the name for the pipeline"
const web_bucket="here is the bucket name"
const repo_name="here is the repo name in CodeCommit"
const branch_name="here is the name of the branch"


export class CdkPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create an S3 bucket
    const deploymentBucket=new s3.Bucket(this, 'WebBucket', {
      versioned: true, // Enable versioning (optional)
      bucketName:web_bucket,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Use DESTROY to delete the bucket when the stack is deleted (use with caution)
      websiteIndexDocument: 'index.html', // Replace with your index document
      publicReadAccess: true, // Allow public read access (required for website hosting)
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
    });

    // Define the existing CodeCommit repository
    const codeCommitRepo = codecommit.Repository.fromRepositoryName(
      this,
      'MyCodeCommitRepo',
      repo_name
    );

    // Define the CodePipeline
    const pipeline = new codepipeline.Pipeline(this, 'WebCodePipeline', {
      pipelineName: pipeline_name
    });
    
    // Add a source stage to the pipeline (e.g., from AWS CodeCommit)
    const sourceOutput = new codepipeline.Artifact();
    const sourceStage ={
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeCommitSourceAction({
          actionName: 'CodeCommit_Source',
          repository: codeCommitRepo,
          branch: branch_name, // Replace with your branch name
          output: sourceOutput,
        }),
      ],
    }

    pipeline.addStage(
      sourceStage
    );

    // Deploy stage (CodeDeploy)
    const deploymentStage = {
      stageName: 'Deploy',
      actions: [
        new codepipeline_actions.S3DeployAction({
          actionName: 'S3_Deploy',
          input: sourceOutput,
          bucket: deploymentBucket,
          extract: true, // Set to true to extract artifacts (e.g., ZIP files) before deploying
        }),
      ],
    };
    pipeline.addStage(deploymentStage);

    // grant permissions for the CodePipeline role to access the S3 bucket
    pipeline.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:PutObject",
          "s3:CreateBucket",
          "s3:DeleteObject",
          "s3:DeleteObjectVersion",
          "s3:GetObjectVersion",
          "s3:GetObject"
        ],
        resources: [deploymentBucket.bucketArn],
      })
    );


    }
}
const app = new cdk.App();
new CdkPipelineStack(app, 'WebCodePipelineStack');    
