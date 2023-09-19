import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
const secretName="here is the name of the secret"
const secretKey="here is the name of the secret key"
const secretValue="here is the name of the secret value"
const aws_region='ca-central-1'
import { ManualApprovalAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Repository } from 'aws-cdk-lib/aws-ecr';
const pipeline_name="pipeline_terraform"
const artifact_bucket="pipeline.artifact.terraform"
const repo_name_CodeCommit="terraform"
const repo_name_ECR="terraform"
const branch_name ="main"
const Image_URL="here is the image url in ECR repo"
const Build_Project_Validate="Project_Validate"
const Build_Project_Plan="Project_Plan"
const Build_Project_Apply="Project_Apply"
const Build_Project_Destroy="Project_Destroy"
const backend_table_name="here is the name for backend dynamodb table"
const backend_s3_bucket_name="here is the name for backend bucket"

export class CicdCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Define the existing CodeCommit repository
    const codeCommitRepo = codecommit.Repository.fromRepositoryName(
    this,
    'MyCodeCommitRepo',
    repo_name_CodeCommit
    );
    
    const secret = secretsmanager.Secret.fromSecretNameV2(this, 'AWS secret', secretName);
    
    // Create an S3 bucket for CodePipeline artifacts
    const artifactBucket = new s3.Bucket(this, 'CodePipelineArtifactBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Only for dev/test purposes
      autoDeleteObjects: true, // to delete the bucket when cdk destroy
      bucketName:artifact_bucket,
      versioned:true,
    });
    const artifactBucketARN=artifactBucket.bucketArn;

    // Define the CodePipeline
    const pipeline = new codepipeline.Pipeline(this, 'TerraformCodePipeline', {
      pipelineName: pipeline_name,
      artifactBucket:artifactBucket
    });

    // 1111111. Add a source stage to the pipeline (e.g., from AWS CodeCommit)
    const sourceOutput = new codepipeline.Artifact('Source_CodeCommit');
    const sourceStage ={
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeCommitSourceAction({
          actionName: 'Source_CodeCommit',
          repository: codeCommitRepo,
          branch: branch_name,
          output: sourceOutput, 
        }),
      ],
    }

    pipeline.addStage(
      sourceStage
    );
    
    // 2222222. Add a 'Validate' Stage
    const ValidateStage = pipeline.addStage({
      stageName:'TerraformValidate',
    });
    
    // Create an IAM role
    const validateRole = new iam.Role(this, 'validateRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      roleName: 'CodeBuildTerraformValidate', // Optional: Specify a custom role name
    });
    // Create policy, CodeBuild ==> ECR
    // Note: there are 2 repos in this example
    // the repo from ECR is to store the container Image 
    // the repo from CodeCommit is to store terraform codes
    // here, we need to get the repo from ECR
    const repo_ECR= ecr.Repository.fromRepositoryName(this,'repo_ECR',repo_name_ECR)
    const repo_ECR_ARN=repo_ECR.repositoryArn;

    const ecrPolicy = new iam.Policy(this, 'ecrPolicy', {
      policyName: 'ecrPolicy', // Optional: Specify a custom policy name
      statements: [
        new iam.PolicyStatement({
          actions: [
            "ecr:GetAuthorizationToken",
          ], // Adjust permissions as needed
          resources: [
            '*'
          ], // You can't restrict this to specific resources as the action require the resources of all
        }),
        new iam.PolicyStatement({
          actions: [
            "ecr:GetDownloadUrlForLayer",
            "ecr:GetRepositoryPolicy",
            "ecr:BatchCheckLayerAvailability",
            "ecr:DescribeRepositories",
            'ecr:ListImages',
            'ecr:DescribeImages',
            'ecr:BatchGetImage',
          ], // Adjust permissions as needed
          resources: [
            repo_ECR_ARN
          ], // You can't restrict this to specific resources as the action require the resources of all
        }),
      ],  
    });
    
    // When terraform init, the terraform will configure the backend
    const backend_s3_bucket=s3.Bucket.fromBucketName(this, 'backend_s3_bucket',backend_s3_bucket_name)
    const backend_s3_ARN=backend_s3_bucket.bucketArn
    const backendS3Policy = new iam.Policy(this, 'backendS3Policy', {
      policyName: 'backendS3Policy', // Optional: Specify a custom policy name
      statements: [
        new iam.PolicyStatement({
          actions: [
            "s3:GetBucketLocation",
            "s3:GetObject",
            "s3:ListBucket",
            "s3:PutObject",
            "s3:DeleteObject"
          ], // Adjust permissions as needed
          resources: [
            backend_s3_ARN,
            backend_s3_ARN + '/*'
          ], // You can restrict this to specific resources if needed
        }),
      ],  
    });

    // Attach the policies to the role
    validateRole.attachInlinePolicy(ecrPolicy)
    validateRole.attachInlinePolicy(backendS3Policy)

    // Create a CodeBuild project for Terraform Validate
    const ValidateProject = new codebuild.PipelineProject(this, 'ValidateProject', {
      projectName:Build_Project_Validate,
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yaml'), 
      // Provide the path to your buildspec.yaml
      role:validateRole,
      environment:{
        buildImage:codebuild.LinuxBuildImage.fromDockerRegistry(Image_URL), // Use a custom Docker image
        environmentVariables:{
          "ACTION": {
            "type": codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            "value": "VALIDATE"  // Replace with your desired value
          },
          "SECRET": {
            value: secret.secretArn,
            type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
        }
      },
    });

    const validateOutput=new codepipeline.Artifact('Build_Validate')
    ValidateStage.addAction(new codepipeline_actions.CodeBuildAction({
      actionName:'Build_Validate',
      project: ValidateProject,
      input:sourceOutput,
      outputs:[validateOutput]
    }));

    // 33333. Add a 'Plan' Stage

    const PlanStage = pipeline.addStage({
      stageName:'TerraformPlan',
    });

    // Create an IAM role 
    const planRole = new iam.Role(this, 'planRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      roleName: 'CodeBuildTerraformPlan', // Optional: Specify a custom role name
    });

    const dynamodbTable=dynamodb.Table.fromTableName(this, 'BackendTable',backend_table_name);
    const dynamodbTableARN=dynamodbTable.tableArn;
    const dynamodbPolicyPlan = new iam.Policy(this, 'dynamodbPolicyPlan', {
      policyName: 'dynamodbPolicyPlan', // Optional: Specify a custom policy name
      statements: [
        new iam.PolicyStatement({
          actions: [
            'dynamodb:GetItem',
          ],
          resources: [
            dynamodbTableARN
            // Additional table ARNs if needed
          ], 
        }),
      ],  
    });

    // Attach the policies to the role
    planRole.attachInlinePolicy(ecrPolicy)
    planRole.attachInlinePolicy(backendS3Policy)
    planRole.attachInlinePolicy(dynamodbPolicyPlan)

    // Create a CodeBuild project for Terraform Plan
    const PlanProject = new codebuild.PipelineProject(this, 'PlanProject', {
      projectName: Build_Project_Plan,
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yaml'), 
      role: planRole,
      // Provide the path to your buildspec.yaml
      environment:{
        buildImage:codebuild.LinuxBuildImage.fromDockerRegistry(Image_URL), // Use a custom Docker image
        environmentVariables:{
          "ACTION": {
            "type": codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            "value": "PLAN"  // Replace with your desired value
          },
          // using below way, the sensitive info will be masked:
          // AWS Access Secret : {"aws_access_key":"***","aws_access_secret":"***"} 
          SECRET: {
            value: secret.secretArn,
            type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          secret_Key:{
            value: secretKey
          },
          secret_Value:{
            value: secretValue
          },
          AWS_DEFAULT_REGION:{
            value: aws_region
          }
        }
      },

    });
    // Put the stages in order in CodeBuild
    PlanProject.node.addDependency(ValidateProject)
    // or to use runorder attribute in action

    const planOutput=new codepipeline.Artifact('Build_Plan')
    PlanStage.addAction(new codepipeline_actions.CodeBuildAction({
      actionName:'Build_Plan',
      project: PlanProject,
      input:validateOutput,
      outputs:[planOutput]
    }));
   
    // if the error of 'lock' occurred, please go to the Dynamodb table and delete the row with the LockID
    // this error happens, because there was an error in the previous terraform commands like apply or destroy
    // to prevent concurrent commands from writing the same dynamodb table, the table is locked
    // after the lock is released, the table is ready for terraform commands again.


    // 44444. Add a 'Manual Approval' Stage

    const manualApprovalAction = new ManualApprovalAction({
      actionName: 'ManualApproval',
      externalEntityLink: 'optional-link-to-approval-details',
      // You can customize additional properties of the ManualApprovalAction here
      
    });
    
    // Add the ManualApprovalAction to a stage in your pipeline
    // Example:
    pipeline.addStage({
      stageName: 'ManualApprovalStage',
      actions: [manualApprovalAction],
      
    });

    // 5555555. Add a 'Apply' Stage/Action
    const ApplyStage = pipeline.addStage({
      stageName:'TerraformApply',
    });
    // Create an IAM role 
    const applyRole = new iam.Role(this, 'applyRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      roleName: 'CodeBuildTerraformApply', // Optional: Specify a custom role name
    });
    const dynamodbPolicyApply = new iam.Policy(this, 'dynamodbPolicyApply', {
      policyName: 'dynamodbPolicyApply', // Optional: Specify a custom policy name
      statements: [
        new iam.PolicyStatement({
          actions: [
            "dynamodb:DescribeTable",
            "dynamodb:GetItem",
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:DeleteItem"
          ],
          resources: [
            dynamodbTableARN
            // Additional table ARNs if needed
          ], 
        }),
      ],  
    });
    // Attach the policies to the role
    applyRole.attachInlinePolicy(ecrPolicy)
    applyRole.attachInlinePolicy(backendS3Policy)
    applyRole.attachInlinePolicy(dynamodbPolicyApply)

    // Create a CodeBuild project for Terraform Apply
    const ApplyProject = new codebuild.PipelineProject(this, 'ApplyProject', {
      projectName: Build_Project_Apply,
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yaml'), 
      // Provide the path to your buildspec.yaml
      role: applyRole,
      environment:{
        buildImage:codebuild.LinuxBuildImage.fromDockerRegistry(Image_URL), // Use a custom Docker image
        environmentVariables:{
          "ACTION": {
            "type": codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            "value": "APPLY"  // Replace with your desired value
          },
          // using below way, the sensitive info will be masked:
          // AWS Access Secret : {"aws_access_key":"***","aws_access_secret":"***"} 
          SECRET: {
            value: secret.secretArn,
            type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          secret_Key:{
            value: secretKey
          },
          secret_Value:{
            value: secretValue
          },
          AWS_DEFAULT_REGION:{
            value: aws_region
          }
        }
      },

    });
    // Put the stages in order in CodeBuild
    ApplyProject.node.addDependency(PlanProject)
    // or to use runorder attribute in action

    const applyOutput=new codepipeline.Artifact('Build_Apply')
    ApplyStage.addAction(new codepipeline_actions.CodeBuildAction({
      actionName:'Build_Apply',
      project: ApplyProject,
      input:planOutput,
      outputs:[applyOutput]
    }));

    // 66666. Add a 'Manual Approval' Stage
    const manualApprovalAction2 = new ManualApprovalAction({
      actionName: 'ManualApproval',
      externalEntityLink: 'optional-link-to-approval-details',
      // You can customize additional properties of the ManualApprovalAction here
    });
    
    // Add the ManualApprovalAction to a stage in your pipeline
    pipeline.addStage({
      stageName: 'ManualApprovalStage2',
      actions: [manualApprovalAction],
    });

    // 7777777. Add a 'Destroy' Stage/Action
    const DestroyStage = pipeline.addStage({
      stageName:'TerraformDestroy',
    });
    // Create an IAM role 
    const destroyRole = new iam.Role(this, 'destroyRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      roleName: 'CodeBuildTerraformDestroy', // Optional: Specify a custom role name
    });
    
    // Attach the policies to the role
    destroyRole.attachInlinePolicy(ecrPolicy)
    destroyRole.attachInlinePolicy(backendS3Policy)
    destroyRole.attachInlinePolicy(dynamodbPolicyApply)
    // Create a CodeBuild project for Terraform Destroy
    const DestroyProject = new codebuild.PipelineProject(this, 'DestroyProject', {
      projectName: Build_Project_Destroy,
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yaml'), 
      // Provide the path to your buildspec.yaml
      role:destroyRole,
      environment:{
        buildImage:codebuild.LinuxBuildImage.fromDockerRegistry(Image_URL), // Use a custom Docker image
        environmentVariables:{
          "ACTION": {
            "type": codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            "value": "DESTROY"  // Replace with your desired value
          },
          // using below way, the sensitive info will be masked:
          // AWS Access Secret : {"aws_access_key":"***","aws_access_secret":"***"} 
          SECRET: {
            value: secret.secretArn,
            type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          secret_Key:{
            value: secretKey
          },
          secret_Value:{
            value: secretValue
          },
          AWS_DEFAULT_REGION:{
            value: aws_region
          }
        }
      },

    });
    // Put the stages in order in CodeBuild
    // =====>
    DestroyProject.node.addDependency(ApplyProject)

    const destroyOutput=new codepipeline.Artifact('Build_Destroy')
    DestroyStage.addAction(new codepipeline_actions.CodeBuildAction({
      actionName:'Build_Destroy',
      project: DestroyProject,
      // =====>
      input:applyOutput,
      outputs:[destroyOutput]
    })); 
    // Attention!! AWS CICD does not support that the user choose among stages to proceed.
    // therefore, we can't combine apply and destroy commands into one and let
    // the manager choose to create or delete the cloud resources by running 'terraform apply' or 'terraform destroy'
  }
}
const app=new cdk.App();
new CicdCdkStack(app,'CicdCdkStack');
